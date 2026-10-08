export default function OrbitMark({ size = 32, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <ellipse
        cx="20"
        cy="20"
        rx="17"
        ry="10"
        transform="rotate(-45 20 20)"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <ellipse
        cx="20"
        cy="20"
        rx="17"
        ry="10"
        transform="rotate(45 20 20)"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
    </svg>
  );
}
