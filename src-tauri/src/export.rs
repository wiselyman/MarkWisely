use base64::{engine::general_purpose, Engine as _};
use comrak::{markdown_to_html, Arena, Options};
use regex::{Captures, Regex};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use typst::layout::PagedDocument;
use typst_as_lib::{typst_kit_options::TypstKitFontOptions, TypstEngine};

pub fn write_html_export(
    markdown: &str,
    output_path: impl AsRef<Path>,
    theme: &str,
    include_styles: bool,
    document_path: Option<String>,
) -> Result<String, String> {
    let output_path = normalize_output_path(output_path)?;
    let markdown = prepare_markdown_for_export(markdown, document_path.as_deref());
    let html = if include_styles {
        render_html_document(&markdown, theme)
    } else {
        render_plain_html_document(&markdown)
    };
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create export directory: {err}"))?;
    }
    fs::write(&output_path, html).map_err(|err| format!("Failed to write HTML export: {err}"))?;
    Ok(output_path.to_string_lossy().to_string())
}

pub fn write_pdf_typst_export(
    markdown: &str,
    output_path: impl AsRef<Path>,
    title: &str,
) -> Result<String, String> {
    let output_path = normalize_output_path(output_path)?;
    let typst_source = markdown_to_typst(markdown, title);
    let pdf = compile_typst_pdf(&typst_source)?;
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create export directory: {err}"))?;
    }
    fs::write(&output_path, pdf).map_err(|err| format!("Failed to write PDF export: {err}"))?;
    Ok(output_path.to_string_lossy().to_string())
}

pub fn detect_pandoc() -> Result<String, String> {
    let output = Command::new("pandoc")
        .arg("--version")
        .output()
        .map_err(|err| format!("Pandoc is not installed or not on PATH: {err}"))?;
    if !output.status.success() {
        return Err("Pandoc is installed but did not report a usable version.".to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().next().unwrap_or("pandoc").to_string())
}

pub fn write_pandoc_export(
    markdown: &str,
    output_path: impl AsRef<Path>,
    format: &str,
    document_path: Option<String>,
    title: Option<&str>,
) -> Result<String, String> {
    let output_path = normalize_output_path(output_path)?;
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create export directory: {err}"))?;
    }
    let writer = pandoc_writer_for_format(format)?;
    let temp_markdown = write_temp_markdown(markdown)?;
    let args = build_pandoc_args(
        &temp_markdown,
        &output_path,
        writer,
        document_path.as_deref(),
        title,
    );
    let status = Command::new("pandoc").args(&args).status();
    let _ = fs::remove_file(&temp_markdown);
    let status = status.map_err(|err| format!("Failed to run Pandoc: {err}"))?;
    if !status.success() {
        return Err(format!(
            "Pandoc export failed with status {}.",
            status.code().unwrap_or(-1)
        ));
    }
    if !output_path.exists() {
        return Err("Pandoc export did not create an output file.".to_string());
    }
    Ok(output_path.to_string_lossy().to_string())
}

pub fn render_html_document(markdown: &str, theme: &str) -> String {
    let mut options = markdown_options();
    options.render.r#unsafe = true;
    options.render.github_pre_lang = true;

    let body = markdown_to_html(markdown, &options);
    let theme_class = if theme == "dark" {
        "theme-dark"
    } else {
        "theme-light"
    };

    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MarkWisely Export</title>
  <style>{}</style>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.css">
</head>
<body class="{theme_class}">
  <main class="markdown-body">
{body}
  </main>
  <script type="module">
    const mathNodes = Array.from(document.querySelectorAll('[data-math-style]'));
    if (mathNodes.length) {{
      try {{
        const {{ default: katex }} = await import('https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.mjs');
        mathNodes.forEach((node) => {{
          const source = node.textContent || '';
          const displayMode = node.getAttribute('data-math-style') === 'display';
          const wrapper = document.createElement(displayMode ? 'div' : 'span');
          wrapper.className = displayMode ? 'katex-display-block' : 'katex-inline';
          wrapper.innerHTML = katex.renderToString(source, {{ displayMode, throwOnError: false, strict: false }});
          node.replaceWith(wrapper);
        }});
      }} catch (error) {{
        mathNodes.forEach((node) => node.classList.add('math-source'));
      }}
    }}
  </script>
  <script type="module">
    const blocks = [];
    document.querySelectorAll('pre code.language-mermaid').forEach((node, index) => {{
      const pre = node.closest('pre');
      const target = document.createElement('div');
      target.className = 'mermaid';
      target.textContent = node.textContent || '';
      target.id = `mermaid-${{index}}`;
      if (pre) {{
        pre.replaceWith(target);
        blocks.push(target);
      }}
    }});
    if (blocks.length) {{
      try {{
        const {{ default: mermaid }} = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
        mermaid.initialize({{ startOnLoad: false, theme: document.body.classList.contains('theme-dark') ? 'dark' : 'default' }});
        await mermaid.run({{ nodes: blocks }});
      }} catch (error) {{
        blocks.forEach((block) => block.classList.add('mermaid-error'));
      }}
    }}
  </script>
  <script>
    document.querySelectorAll('pre code.language-mermaid').forEach((node) => {{
      const pre = node.closest('pre');
      if (pre) {{
        pre.classList.add('mermaid-source');
      }}
    }});
  </script>
</body>
</html>
"#,
        export_css()
    )
}

pub fn render_plain_html_document(markdown: &str) -> String {
    let mut options = markdown_options();
    options.render.r#unsafe = true;
    options.render.github_pre_lang = true;
    let body = markdown_to_html(markdown, &options);
    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MarkWisely Export</title>
</head>
<body>
{body}
</body>
</html>
"#
    )
}

pub fn markdown_to_typst(markdown: &str, title: &str) -> String {
    // Keep Comrak in the path so the exporter follows the same Markdown extension
    // set as HTML export, even though V1 Typst emission intentionally supports a
    // conservative subset.
    let arena = Arena::new();
    let _ = comrak::parse_document(&arena, markdown, &markdown_options());

    let mut output = String::new();
    output.push_str("#set page(paper: \"a4\", margin: 2.2cm)\n");
    output.push_str("#set text(size: 11pt, lang: \"en\")\n");
    output.push_str("#set par(justify: false, leading: 0.72em)\n");
    output.push_str("#show raw: set block(fill: luma(245), inset: 8pt, radius: 3pt)\n");
    output.push_str("#show link: set text(fill: rgb(\"#2563eb\"))\n\n");

    if !title.trim().is_empty() {
        output.push_str(&format!("= {}\n\n", escape_typst_markup(title.trim())));
    }

    let mut paragraph = Vec::new();
    let mut table_rows = Vec::new();
    let mut in_code = false;
    let mut code_lang = String::new();
    let mut code = String::new();
    let mut in_math = false;
    let mut math = String::new();

    for line in markdown.lines() {
        let trimmed = line.trim_end();

        if trimmed.trim() == "$$" {
            flush_paragraph(&mut output, &mut paragraph);
            flush_table(&mut output, &mut table_rows);
            if in_math {
                output.push('$');
                output.push_str(math.trim());
                output.push_str("$\n\n");
                math.clear();
                in_math = false;
            } else {
                in_math = true;
            }
            continue;
        }

        if in_math {
            math.push_str(trimmed);
            math.push('\n');
            continue;
        }

        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            if in_code {
                flush_paragraph(&mut output, &mut paragraph);
                flush_table(&mut output, &mut table_rows);
                output.push_str(&format!(
                    "#raw({}, block: true{})\n\n",
                    typst_string(&code),
                    if code_lang.is_empty() {
                        String::new()
                    } else {
                        format!(", lang: {}", typst_string(&code_lang))
                    }
                ));
                in_code = false;
                code_lang.clear();
                code.clear();
            } else {
                flush_paragraph(&mut output, &mut paragraph);
                flush_table(&mut output, &mut table_rows);
                in_code = true;
                code_lang = trimmed
                    .trim_start_matches('`')
                    .trim_start_matches('~')
                    .trim()
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .to_string();
            }
            continue;
        }

        if in_code {
            code.push_str(trimmed);
            code.push('\n');
            continue;
        }

        if looks_like_table_row(trimmed) {
            flush_paragraph(&mut output, &mut paragraph);
            table_rows.push(trimmed.to_string());
            continue;
        }
        flush_table(&mut output, &mut table_rows);

        if trimmed.is_empty() {
            flush_paragraph(&mut output, &mut paragraph);
            continue;
        }

        if is_front_matter_fence(trimmed) {
            flush_paragraph(&mut output, &mut paragraph);
            continue;
        }

        if trimmed.eq_ignore_ascii_case("[toc]") {
            flush_paragraph(&mut output, &mut paragraph);
            output.push_str("#outline(title: none, depth: 3)\n\n");
            continue;
        }

        if is_page_break(trimmed) {
            flush_paragraph(&mut output, &mut paragraph);
            output.push_str("#pagebreak()\n\n");
            continue;
        }

        if let Some((level, heading)) = parse_heading(trimmed) {
            flush_paragraph(&mut output, &mut paragraph);
            let level = level.clamp(1, 6);
            output.push_str(&"=".repeat(level));
            output.push(' ');
            output.push_str(&escape_typst_markup(heading));
            output.push_str("\n\n");
            continue;
        }

        if is_thematic_break(trimmed) {
            flush_paragraph(&mut output, &mut paragraph);
            output.push_str("#line(length: 100%)\n\n");
            continue;
        }

        if let Some(item) = parse_unordered_list_item(trimmed) {
            flush_paragraph(&mut output, &mut paragraph);
            output.push_str("- ");
            output.push_str(&format_inline_typst(item));
            output.push('\n');
            continue;
        }

        if let Some(item) = parse_ordered_list_item(trimmed) {
            flush_paragraph(&mut output, &mut paragraph);
            output.push_str("+ ");
            output.push_str(&format_inline_typst(item));
            output.push('\n');
            continue;
        }

        if let Some(quote) = trimmed.strip_prefix("> ") {
            flush_paragraph(&mut output, &mut paragraph);
            output.push_str("#pad(left: 12pt)[");
            output.push_str(&format_inline_typst(quote));
            output.push_str("]\n\n");
            continue;
        }

        paragraph.push(trimmed.to_string());
    }

    if in_code {
        output.push_str(&format!("#raw({}, block: true)\n\n", typst_string(&code)));
    }
    if in_math {
        output.push('$');
        output.push_str(math.trim());
        output.push_str("$\n\n");
    }
    flush_table(&mut output, &mut table_rows);
    flush_paragraph(&mut output, &mut paragraph);

    output
}

fn compile_typst_pdf(source: &str) -> Result<Vec<u8>, String> {
    let engine = TypstEngine::builder()
        .main_file(source)
        .search_fonts_with(
            TypstKitFontOptions::new()
                .include_system_fonts(true)
                .include_embedded_fonts(true),
        )
        .build();

    let doc: PagedDocument = engine
        .compile()
        .output
        .map_err(|err| format!("Typst compilation failed: {err:?}"))?;

    typst_pdf::pdf(&doc, &Default::default())
        .map_err(|err| format!("PDF generation failed: {err:?}"))
}

fn markdown_options<'a>() -> Options<'a> {
    let mut options = Options::default();
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.autolink = true;
    options.extension.tasklist = true;
    options.extension.footnotes = true;
    options.extension.description_lists = true;
    options.extension.math_dollars = true;
    options.extension.front_matter_delimiter = Some("---".to_string());
    options.extension.header_id_prefix = Some(String::new());
    options.parse.smart = true;
    options
}

fn normalize_output_path(path: impl AsRef<Path>) -> Result<PathBuf, String> {
    let path = path.as_ref();
    if path.as_os_str().is_empty() {
        return Err("Export path is empty".to_string());
    }
    if path.is_absolute() {
        Ok(path.to_path_buf())
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|err| format!("Failed to resolve current directory: {err}"))
    }
}

fn write_temp_markdown(markdown: &str) -> Result<PathBuf, String> {
    let path = unique_temp_path("markwisely-pandoc", "md");
    fs::write(&path, markdown).map_err(|err| format!("Failed to prepare Pandoc input: {err}"))?;
    Ok(path)
}

fn unique_temp_path(prefix: &str, extension: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    std::env::temp_dir().join(format!(
        "{prefix}-{}-{stamp}.{extension}",
        std::process::id()
    ))
}

fn pandoc_writer_for_format(format: &str) -> Result<&'static str, String> {
    match format {
        "docx" => Ok("docx"),
        "epub" | "epub3" => Ok("epub3"),
        "latex" | "tex" => Ok("latex"),
        "odt" | "opendocument" => Ok("odt"),
        "mediawiki" => Ok("mediawiki"),
        _ => Err(format!("Unsupported Pandoc export format: {format}")),
    }
}

fn pandoc_source_format() -> &'static str {
    "markdown+pipe_tables+task_lists+tex_math_dollars+footnotes+yaml_metadata_block+raw_html+markdown_in_html_blocks+fenced_code_attributes"
}

fn build_pandoc_args(
    input_path: &Path,
    output_path: &Path,
    writer: &str,
    document_path: Option<&str>,
    title: Option<&str>,
) -> Vec<String> {
    let mut args = vec![
        input_path.to_string_lossy().to_string(),
        "-f".to_string(),
        pandoc_source_format().to_string(),
        "-t".to_string(),
        writer.to_string(),
        "--standalone".to_string(),
    ];

    if let Some(title) = title.map(str::trim).filter(|value| !value.is_empty()) {
        args.push("--metadata".to_string());
        args.push(format!("title={title}"));
    }

    if let Some(resource_path) = pandoc_resource_path(document_path) {
        args.push("--resource-path".to_string());
        args.push(resource_path);
    }

    args.push("-o".to_string());
    args.push(output_path.to_string_lossy().to_string());
    args
}

fn pandoc_resource_path(document_path: Option<&str>) -> Option<String> {
    let document_path = Path::new(document_path?);
    let parent = document_path.parent()?;
    if parent.as_os_str().is_empty() {
        return None;
    }
    Some(parent.to_string_lossy().to_string())
}

fn prepare_markdown_for_export(markdown: &str, document_path: Option<&str>) -> String {
    let Some(document_path) = document_path else {
        return markdown.to_string();
    };
    let document_path = Path::new(document_path);
    let Some(base_dir) = document_path.parent() else {
        return markdown.to_string();
    };
    inline_relative_images(markdown, base_dir)
}

fn inline_relative_images(markdown: &str, base_dir: &Path) -> String {
    let image_regex =
        Regex::new(r#"!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)"#).expect("valid image regex");

    image_regex
        .replace_all(markdown, |captures: &Captures| {
            let alt = captures.get(1).map(|value| value.as_str()).unwrap_or("");
            let src = captures.get(2).map(|value| value.as_str()).unwrap_or("");
            if is_external_or_absolute(src) {
                return captures
                    .get(0)
                    .map(|value| value.as_str().to_string())
                    .unwrap_or_default();
            }

            let path = base_dir.join(src);
            let Ok(bytes) = fs::read(&path) else {
                return captures
                    .get(0)
                    .map(|value| value.as_str().to_string())
                    .unwrap_or_default();
            };
            let mime = mime_from_extension(&path);
            let encoded = general_purpose::STANDARD.encode(bytes);
            format!("![{alt}](data:{mime};base64,{encoded})")
        })
        .to_string()
}

fn is_external_or_absolute(src: &str) -> bool {
    src.starts_with("http://")
        || src.starts_with("https://")
        || src.starts_with("data:")
        || src.starts_with("file:")
        || Path::new(src).is_absolute()
        || src.contains("://")
}

fn mime_from_extension(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        _ => "image/png",
    }
}

fn flush_paragraph(output: &mut String, paragraph: &mut Vec<String>) {
    if paragraph.is_empty() {
        return;
    }
    output.push_str(&format_inline_typst(&paragraph.join(" ")));
    output.push_str("\n\n");
    paragraph.clear();
}

fn flush_table(output: &mut String, rows: &mut Vec<String>) {
    if rows.is_empty() {
        return;
    }

    let parsed_rows: Vec<Vec<String>> = rows
        .iter()
        .filter_map(|row| parse_table_cells(row))
        .collect();
    let has_delimiter = parsed_rows
        .get(1)
        .map(|row| row.iter().all(|cell| is_table_delimiter_cell(cell)))
        .unwrap_or(false);

    if parsed_rows.is_empty()
        || parsed_rows.iter().map(Vec::len).min() != parsed_rows.iter().map(Vec::len).max()
    {
        for row in rows.iter() {
            output.push_str("#raw(");
            output.push_str(&typst_string(row));
            output.push_str(", block: true)\n\n");
        }
        rows.clear();
        return;
    }

    let column_count = parsed_rows.first().map(Vec::len).unwrap_or(1).max(1);
    output.push_str("#table(\n");
    output.push_str(&format!("  columns: {column_count},\n"));

    let data_start = if has_delimiter {
        if let Some(header) = parsed_rows.first() {
            output.push_str("  table.header(");
            output.push_str(
                &header
                    .iter()
                    .map(|cell| format!("[{}]", format_inline_typst(cell)))
                    .collect::<Vec<_>>()
                    .join(", "),
            );
            output.push_str("),\n");
        }
        2
    } else {
        0
    };

    for row in parsed_rows.iter().skip(data_start) {
        for cell in row {
            output.push_str("  [");
            output.push_str(&format_inline_typst(cell));
            output.push_str("],\n");
        }
    }
    output.push_str(")\n\n");
    rows.clear();
}

fn parse_heading(line: &str) -> Option<(usize, &str)> {
    let marker_count = line.chars().take_while(|char| *char == '#').count();
    if marker_count == 0 || marker_count > 6 {
        return None;
    }
    let rest = line.get(marker_count..)?.trim_start();
    if rest.is_empty() {
        None
    } else {
        Some((marker_count, rest.trim_end_matches('#').trim()))
    }
}

fn parse_unordered_list_item(line: &str) -> Option<&str> {
    let rest = line
        .strip_prefix("- ")
        .or_else(|| line.strip_prefix("* "))
        .or_else(|| line.strip_prefix("+ "))?;
    Some(
        rest.strip_prefix("[ ] ")
            .or_else(|| rest.strip_prefix("[x] "))
            .or_else(|| rest.strip_prefix("[X] "))
            .unwrap_or(rest),
    )
}

fn parse_ordered_list_item(line: &str) -> Option<&str> {
    let (digits, rest) = line.split_once(". ")?;
    if digits.chars().all(|char| char.is_ascii_digit()) {
        Some(rest)
    } else {
        None
    }
}

fn is_thematic_break(line: &str) -> bool {
    matches!(line, "---" | "***" | "___")
}

fn is_page_break(line: &str) -> bool {
    matches!(
        line.trim().to_ascii_lowercase().as_str(),
        "<!-- pagebreak -->" | "<!-- page break -->" | "{pagebreak}" | "\\pagebreak"
    )
}

fn is_front_matter_fence(line: &str) -> bool {
    matches!(line, "---" | "+++")
}

fn looks_like_table_row(line: &str) -> bool {
    line.contains('|') && line.matches('|').count() >= 2
}

fn parse_table_cells(line: &str) -> Option<Vec<String>> {
    if !looks_like_table_row(line) {
        return None;
    }
    let cells = line
        .trim()
        .trim_start_matches('|')
        .trim_end_matches('|')
        .split('|')
        .map(|cell| cell.trim().to_string())
        .collect::<Vec<_>>();
    if cells.len() > 1 {
        Some(cells)
    } else {
        None
    }
}

fn is_table_delimiter_cell(cell: &str) -> bool {
    let trimmed = cell.trim();
    trimmed.len() >= 3 && trimmed.trim_matches(':').chars().all(|char| char == '-')
}

fn format_inline_typst(input: &str) -> String {
    let mut output = String::new();
    let mut rest = input;

    while !rest.is_empty() {
        if let Some(after_tick) = rest.strip_prefix('`') {
            if let Some(end) = after_tick.find('`') {
                let (code, next) = after_tick.split_at(end);
                output.push_str("#raw(");
                output.push_str(&typst_string(code));
                output.push(')');
                rest = &next[1..];
                continue;
            }
        }

        if let Some(after_dollar) = rest.strip_prefix('$') {
            if let Some(end) = after_dollar.find('$') {
                let (math, next) = after_dollar.split_at(end);
                output.push('$');
                output.push_str(math);
                output.push('$');
                rest = &next[1..];
                continue;
            }
        }

        if rest.starts_with('[') {
            if let Some(close_label) = rest.find("](") {
                if let Some(close_url) = rest[close_label + 2..].find(')') {
                    let label = &rest[1..close_label];
                    let url_start = close_label + 2;
                    let url_end = url_start + close_url;
                    let url = &rest[url_start..url_end];
                    output.push_str("#link(");
                    output.push_str(&typst_string(url));
                    output.push_str(")[");
                    output.push_str(&format_inline_typst(label));
                    output.push(']');
                    rest = &rest[url_end + 1..];
                    continue;
                }
            }
        }

        let mut chars = rest.chars();
        let Some(char) = chars.next() else {
            break;
        };
        output.push_str(&escape_typst_markup(&char.to_string()));
        rest = chars.as_str();
    }

    output
}

fn escape_typst_markup(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('#', "\\#")
        .replace('$', "\\$")
        .replace('%', "\\%")
        .replace('&', "\\&")
        .replace('_', "\\_")
        .replace('{', "\\{")
        .replace('}', "\\}")
        .replace('~', "\\~")
        .replace('^', "\\^")
}

fn typst_string(input: &str) -> String {
    let escaped = input
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n");
    format!("\"{escaped}\"")
}

fn export_css() -> &'static str {
    r#"
:root {
  color-scheme: light dark;
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
}
body {
  margin: 0;
  background: #f6f2ea;
  color: #24211d;
}
body.theme-dark {
  background: #151719;
  color: #e8e3da;
}
.markdown-body {
  max-width: 820px;
  margin: 0 auto;
  padding: 56px 36px 72px;
  line-height: 1.68;
  font-size: 17px;
}
h1, h2, h3, h4, h5, h6 {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.2;
  margin-top: 2em;
}
h1 { font-size: 2.2rem; margin-top: 0; }
h2 { font-size: 1.55rem; border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent); padding-bottom: 0.35em; }
a { color: #2563eb; }
code, pre {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
pre {
  overflow: auto;
  padding: 16px;
  border-radius: 8px;
  background: color-mix(in srgb, currentColor 8%, transparent);
}
blockquote {
  margin: 1.5em 0;
  padding-left: 1em;
  border-left: 3px solid #6d8fbd;
  color: color-mix(in srgb, currentColor 72%, transparent);
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.2em 0;
}
th, td {
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  padding: 8px 10px;
}
img {
  max-width: 100%;
  height: auto;
}
.katex-display-block {
  margin: 1em 0;
  overflow-x: auto;
}
.math-source {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  background: color-mix(in srgb, currentColor 8%, transparent);
  border-radius: 4px;
  padding: 0.1em 0.3em;
}
.task-list-item {
  list-style: none;
}
"#
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_html_with_headings_and_tasks() {
        let html = render_html_document("# Title\n\n- [x] Done\n\nInline $x^2$.", "light");
        assert!(html.contains("<h1"));
        assert!(html.contains("checkbox"));
        assert!(html.contains("data-math-style=\"inline\""));
        assert!(html.contains("katex.mjs"));
    }

    #[test]
    fn renders_html_without_styles() {
        let html = render_plain_html_document("# Title");
        assert!(html.contains("<h1"));
        assert!(!html.contains("<style>"));
    }

    #[test]
    fn typst_export_contains_expected_blocks() {
        let typst = markdown_to_typst(
            "# Title\n\n[TOC]\n\nParagraph with [link](https://example.com) and $x^2$.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<!-- pagebreak -->\n\n$$\na^2 + b^2 = c^2\n$$\n\n- item\n\n```rs\nfn main() {}\n```",
            "Doc",
        );
        assert!(typst.contains("= Doc"));
        assert!(typst.contains("= Title"));
        assert!(typst.contains("#outline"));
        assert!(typst.contains("#link(\"https://example.com\")"));
        assert!(typst.contains("$x^2$"));
        assert!(typst.contains("#table("));
        assert!(typst.contains("#pagebreak()"));
        assert!(typst.contains("$a^2 + b^2 = c^2$"));
        assert!(typst.contains("- item"));
        assert!(typst.contains("raw"));
    }

    #[test]
    fn writes_pdf_export() {
        let temp = tempfile::tempdir().unwrap();
        let output = temp.path().join("note.pdf");
        let written = write_pdf_typst_export("# Title\n\nA short note.", &output, "Note").unwrap();
        assert_eq!(written, output.to_string_lossy());
        assert!(std::fs::metadata(output).unwrap().len() > 1000);
    }

    #[test]
    fn inlines_relative_images_for_html_export() {
        let temp = tempfile::tempdir().unwrap();
        let doc = temp.path().join("note.md");
        let assets = temp.path().join("assets");
        std::fs::create_dir(&assets).unwrap();
        std::fs::write(&doc, "# Note").unwrap();
        std::fs::write(assets.join("pixel.png"), [137, 80, 78, 71]).unwrap();

        let output = temp.path().join("note.html");
        write_html_export(
            "![Pixel](assets/pixel.png)",
            &output,
            "light",
            true,
            Some(doc.to_string_lossy().to_string()),
        )
        .unwrap();
        let html = std::fs::read_to_string(output).unwrap();
        assert!(html.contains("data:image/png;base64"));
    }

    #[test]
    fn maps_pandoc_export_profiles_to_writers() {
        assert_eq!(pandoc_writer_for_format("docx").unwrap(), "docx");
        assert_eq!(pandoc_writer_for_format("epub").unwrap(), "epub3");
        assert_eq!(pandoc_writer_for_format("epub3").unwrap(), "epub3");
        assert_eq!(pandoc_writer_for_format("latex").unwrap(), "latex");
        assert_eq!(pandoc_writer_for_format("odt").unwrap(), "odt");
        assert_eq!(pandoc_writer_for_format("opendocument").unwrap(), "odt");
        assert_eq!(pandoc_writer_for_format("mediawiki").unwrap(), "mediawiki");
        assert!(pandoc_writer_for_format("pdf").is_err());
        assert!(pandoc_writer_for_format("html").is_err());
    }

    #[test]
    fn builds_pandoc_args_with_title_and_document_resource_path() {
        let temp = tempfile::tempdir().unwrap();
        let document_path = temp.path().join("draft.md");
        let document_path = document_path.to_string_lossy().to_string();
        let input = Path::new("/tmp/markwisely-input.md");
        let output = Path::new("/tmp/markwisely-output.docx");
        let args = build_pandoc_args(
            input,
            output,
            "docx",
            Some(&document_path),
            Some("Draft Title"),
        );

        assert!(args.contains(&input.to_string_lossy().to_string()));
        assert!(args.contains(&"-f".to_string()));
        assert!(args.contains(&pandoc_source_format().to_string()));
        assert!(args.contains(&"-t".to_string()));
        assert!(args.contains(&"docx".to_string()));
        assert!(args.contains(&"--standalone".to_string()));
        assert!(args.contains(&"--metadata".to_string()));
        assert!(args.contains(&"title=Draft Title".to_string()));
        assert!(args.contains(&"--resource-path".to_string()));
        assert!(args.contains(&temp.path().to_string_lossy().to_string()));
        assert!(args.contains(&"-o".to_string()));
        assert!(args.contains(&output.to_string_lossy().to_string()));
    }

    #[test]
    fn writes_pandoc_formats_when_available() {
        if detect_pandoc().is_err() {
            return;
        }

        let temp = tempfile::tempdir().unwrap();
        for (format, extension) in [
            ("docx", "docx"),
            ("epub3", "epub"),
            ("latex", "tex"),
            ("odt", "odt"),
            ("mediawiki", "mediawiki"),
        ] {
            let output = temp.path().join(format!("note.{extension}"));
            let written = write_pandoc_export(
                "# Title\n\nA short note with **bold** text.\n\n- one\n- two",
                &output,
                format,
                None,
                Some("Note"),
            )
            .unwrap_or_else(|error| panic!("{format} export failed: {error}"));
            assert_eq!(written, output.to_string_lossy());
            assert!(
                std::fs::metadata(&output).unwrap().len() > 0,
                "{format} export should not be empty"
            );
        }
    }
}
