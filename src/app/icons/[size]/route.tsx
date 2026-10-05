import { ImageResponse } from "next/og";

const SIZES = new Set([180, 192, 512]);

/** Íconos PNG de la app instalable (se generan al vuelo y se cachean). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("No encontrado", { status: 404 });
  const s = size / 512;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#2f6b4f",
      }}
    >
      <svg width={300 * s} height={300 * s} viewBox="0 0 24 24">
        <path
          d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z"
          fill="#e3a21a"
          stroke="#e3a21a"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800" } },
  );
}
