export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="aman-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b98d" />
          <stop offset="1" stopColor="#047860" />
        </linearGradient>
      </defs>
      <path d="M16 2 4 6.5v8.2C4 22.3 9.1 28.2 16 30c6.9-1.8 12-7.7 12-15.3V6.5L16 2Z" fill="url(#aman-g)" />
      <path d="m11 16.2 3.4 3.4L21.5 12.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
