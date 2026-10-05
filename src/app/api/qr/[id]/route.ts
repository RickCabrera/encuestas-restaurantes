import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { canAccessRestaurant } from "@/lib/authz";
import { isUuid } from "@/lib/ids";
import { appUrl } from "@/lib/request";

const INK = rgb(0.11, 0.15, 0.13);
const SOFT = rgb(0.34, 0.38, 0.36);
const LINE = rgb(0.85, 0.87, 0.85);

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function qrPng(url: string, width: number) {
  return QRCode.toBuffer(url, {
    type: "png",
    width,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1c2621", light: "#ffffff" },
  });
}

function centered(page: PDFPage, text: string, font: PDFFont, size: number, y: number, x0: number, w: number, color = INK) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x0 + (w - tw) / 2, y, size, font, color });
}

function fit(text: string, font: PDFFont, size: number, maxW: number) {
  let t = text;
  while (t.length > 3 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2);
  return t === text ? t : `${t.trimEnd()}…`;
}

/** QR del restaurante: PNG, PDF de una hoja, o PDF con un QR por mesa (?tables=1-20). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id) || !canAccessRestaurant(user, id)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, id) });
  if (!r) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") === "pdf" ? "pdf" : "png";
  const base = `${await appUrl()}/r/${r.slug}`;
  const fileBase = `qr-${r.slug}`;

  if (format === "png") {
    const png = await qrPng(`${base}?c=qr`, 1024);
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=300",
        ...(sp.get("download") ? { "Content-Disposition": `attachment; filename="${fileBase}.png"` } : {}),
      },
    });
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(`QR ${r.name}`);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const brand = hexToRgb(r.primaryColor);

  let logo: PDFImage | null = null;
  if (r.logoData && r.logoMime === "image/png") logo = await pdf.embedPng(r.logoData).catch(() => null);
  if (r.logoData && r.logoMime === "image/jpeg") logo = await pdf.embedJpg(r.logoData).catch(() => null);

  const tablesParam = sp.get("tables");
  const m = tablesParam ? /^(\d{1,4})-(\d{1,4})$/.exec(tablesParam) : null;

  if (!m) {
    // Una hoja carta con un QR grande.
    const page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: brand });
    let y = 680;
    if (logo) {
      const dims = logo.scaleToFit(90, 60);
      page.drawImage(logo, { x: (612 - dims.width) / 2, y: y - dims.height + 20, ...dims });
      y -= dims.height + 10;
    }
    centered(page, fit(r.name, bold, 26, 520), bold, 26, y, 0, 612);
    centered(page, "¿Cómo estuvo tu visita?", bold, 34, y - 60, 0, 612);
    centered(page, "Califica tu experiencia en menos de un minuto.", regular, 15, y - 88, 0, 612, SOFT);
    const qr = await pdf.embedPng(await qrPng(`${base}?c=qr`, 900));
    const size = 300;
    page.drawImage(qr, { x: (612 - size) / 2, y: y - 120 - size, width: size, height: size });
    centered(page, "Escanea el código con la cámara de tu celular", regular, 14, y - 150 - size, 0, 612, SOFT);
    centered(page, base.replace(/^https?:\/\//, ""), regular, 11, 60, 0, 612, SOFT);
    const bytes = await pdf.save();
    return pdfResponse(bytes, `${fileBase}.pdf`);
  }

  const from = Number(m[1]);
  const to = Number(m[2]);
  if (from < 1 || to < from || to - from >= 200) {
    return NextResponse.json({ error: "Rango de mesas inválido (máximo 200)" }, { status: 400 });
  }

  // Tarjetas de 2 × 3 por hoja carta, con línea de corte.
  const cols = 2;
  const rows = 3;
  const cardW = 612 / cols;
  const cardH = 792 / rows;
  let page: PDFPage | null = null;
  for (let t = from, i = 0; t <= to; t++, i++) {
    const slot = i % (cols * rows);
    if (slot === 0) {
      page = pdf.addPage([612, 792]);
      page.drawLine({ start: { x: cardW, y: 0 }, end: { x: cardW, y: 792 }, thickness: 0.5, color: LINE, dashArray: [4, 4] });
      for (let rr = 1; rr < rows; rr++)
        page.drawLine({
          start: { x: 0, y: cardH * rr },
          end: { x: 612, y: cardH * rr },
          thickness: 0.5,
          color: LINE,
          dashArray: [4, 4],
        });
    }
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x0 = col * cardW;
    const y0 = 792 - (row + 1) * cardH;
    const p = page!;
    centered(p, fit(r.name, bold, 13, cardW - 40), bold, 13, y0 + cardH - 30, x0, cardW, SOFT);
    centered(p, `Mesa ${t}`, bold, 22, y0 + cardH - 58, x0, cardW, brand);
    const qr = await pdf.embedPng(await qrPng(`${base}?c=qr&mesa=${t}`, 480));
    const qs = 140;
    p.drawImage(qr, { x: x0 + (cardW - qs) / 2, y: y0 + 40, width: qs, height: qs });
    centered(p, "Escanea y califica tu visita", regular, 11, y0 + 22, x0, cardW, SOFT);
  }
  const bytes = await pdf.save();
  return pdfResponse(bytes, `${fileBase}-mesas-${from}-${to}.pdf`);
}

function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
