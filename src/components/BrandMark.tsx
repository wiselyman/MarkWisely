type BrandMarkProps = {
  size?: number;
};

export function BrandMark({ size = 34 }: BrandMarkProps) {
  return (
    <svg
      className="brand-mark-svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="MarkWisely logo"
    >
      <rect x="6" y="6" width="52" height="52" rx="15" fill="#FBFAF7" stroke="#D9D7CF" strokeWidth="2" />
      <path
        d="M19 42V23l13 15 13-15v19"
        fill="none"
        stroke="#24282C"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="46" cy="19" r="3.5" fill="#6F9B82" />
    </svg>
  );
}
