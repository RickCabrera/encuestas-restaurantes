import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(140deg, #23a285 0%, #0a6b55 100%)",
        borderRadius: 14,
      }}
    >
      <svg width={48} height={48} viewBox="0 0 32 32">
        <path
          d="M6 8.5A4.5 4.5 0 0 1 10.5 4h11A4.5 4.5 0 0 1 26 8.5v8a4.5 4.5 0 0 1-4.5 4.5H14l-5.2 4.3c-.7.6-1.8.1-1.8-.8V21A4.5 4.5 0 0 1 6 16.5v-8Z"
          fill="#ffffff"
        />
        <path d="m16 7.6 1.55 3.14 3.47.5-2.51 2.45.6 3.45L16 15.5l-3.1 1.64.59-3.45-2.5-2.45 3.46-.5L16 7.6Z" fill="#e8a317" />
      </svg>
    </div>,
    size,
  );
}
