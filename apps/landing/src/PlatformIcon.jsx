import { Monitor } from "lucide-react";
export default function PlatformIcon({ platform }) {
  if (platform === "windows")
    return (
      <svg
        className="platform-icon"
        viewBox="0 0 32 32"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M2 5 14 3v12H2zm14-2 14-2v14H16zM2 17h12v12L2 27zm14 0h14v14l-14-2z" />
      </svg>
    );
  if (platform === "mac")
    return (
      <svg
        className="platform-icon"
        viewBox="0 0 32 32"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M23 17c0-4 3-5 3-5-2-3-5-3-6-3-2 0-3 1-4 1s-3-1-5-1c-4 0-7 4-7 9s4 12 7 12c2 0 3-1 5-1s3 1 5 1c3 0 6-6 7-8-3-1-5-3-5-5ZM21 2c-4 0-7 3-6 7 4 0 7-3 6-7Z" />
      </svg>
    );
  return <Monitor className="platform-icon" strokeWidth={1.3} />;
}
