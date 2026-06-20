use std::{
    ffi::CStr,
    sync::{Once, OnceLock},
};

use objc2::{
    ffi::class_addMethod,
    runtime::{AnyClass, AnyObject, Bool, Imp, Sel},
    sel,
};
use objc2_foundation::{NSArray, NSString};
use tauri::{AppHandle, Manager};

use crate::open_files;

static INSTALL: Once = Once::new();
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub fn install(app: &AppHandle) {
    let _ = APP_HANDLE.set(app.clone());
    INSTALL.call_once(|| unsafe {
        add_delegate_method(
            sel!(application:openFiles:),
            application_open_files as unsafe extern "C-unwind" fn(&AnyObject, Sel, &AnyObject, &NSArray<NSString>),
            c"v@:@@",
        );
        add_delegate_method(
            sel!(application:openFile:),
            application_open_file as unsafe extern "C-unwind" fn(&AnyObject, Sel, &AnyObject, &NSString) -> Bool,
            c"B@:@@",
        );
    });
}

unsafe fn add_delegate_method<F>(selector: Sel, function: F, encoding: &'static CStr)
where
    F: Copy,
{
    let Some(class) = AnyClass::get(c"TaoAppDelegateParent") else {
        log::warn!("Could not install macOS open-file bridge: TaoAppDelegateParent not registered");
        return;
    };

    let imp = std::mem::transmute_copy::<F, Imp>(&function);
    let added = class_addMethod(class as *const AnyClass as *mut AnyClass, selector, imp, encoding.as_ptr());
    if added.as_bool() {
        log::info!("Installed macOS open-file bridge for {selector}");
    } else {
        log::info!("macOS open-file bridge already installed for {selector}");
    }
}

unsafe extern "C-unwind" fn application_open_files(
    _: &AnyObject,
    _: Sel,
    _: &AnyObject,
    file_names: &NSArray<NSString>,
) {
    let file_names = (0..file_names.count())
        .map(|index| file_names.objectAtIndex(index).to_string())
        .collect::<Vec<_>>();
    open_markdown_file_names(file_names);
}

unsafe extern "C-unwind" fn application_open_file(
    _: &AnyObject,
    _: Sel,
    _: &AnyObject,
    file_name: &NSString,
) -> Bool {
    let opened = open_markdown_file_names(vec![file_name.to_string()]);
    Bool::new(opened)
}

fn open_markdown_file_names(file_names: Vec<String>) -> bool {
    let paths = open_files::collect_markdown_paths_from_file_names(file_names);
    if paths.is_empty() {
        return false;
    }

    if let Some(app) = APP_HANDLE.get() {
        open_files::queue_open_paths(app, paths);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        true
    } else {
        log::warn!("Could not open macOS document paths before app handle was registered");
        false
    }
}
