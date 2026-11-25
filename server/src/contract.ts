import PDFDocument from 'pdfkit';
import { money, STATUS_LABEL } from './common.js';
import { billableDays } from './pricing.js';

type Input = {
  reservation: any;
  client: any | null;
  payments: any[];
  business: { name?: string; phone?: string; city?: string; legal_name?: string; address?: string };
};

const TZ = 'America/Merida';
const fmt = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('es-MX', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' }) : '—';
const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-MX', { timeZone: TZ, dateStyle: 'medium' }) : '—';
const KIND: Record<string, string> = { deposit: 'Anticipo', payment: 'Pago', refund: 'Reembolso' };
const METHOD: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro' };

const CLAUSES = [
  'La unidad se entrega y debe devolverse con el mismo nivel de combustible. El faltante se cobrará al precio vigente más el servicio de recarga.',
  'Solo puede conducir la persona registrada en este contrato, con licencia vigente, salvo autorización expresa y por escrito de la arrendadora.',
  'El arrendatario es responsable de daños por uso indebido o negligencia, así como de multas, infracciones y adeudos generados durante la renta.',
  'Las devoluciones tardías generan cargo adicional proporcional a la tarifa diaria vigente.',
  'Queda prohibido subarrendar la unidad, usarla para fines ilícitos, remolcar o transportar carga que exceda su capacidad.',
  'El depósito en garantía se reembolsa al término de la renta una vez revisada la unidad y sin adeudos pendientes.',
  'Cualquier accidente, falla mecánica o incidente debe reportarse de inmediato por WhatsApp a la arrendadora.',
  'Los viajes fuera del área metropolitana deben acordarse previamente con la arrendadora.',
];

export function buildContract({ reservation: r, client: c, payments, business }: Input): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `Contrato ${r.folio}`, Author: business.name ?? 'Turi Express MX' } });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 96;
    const ink = '#0f2a3d', muted = '#5b6b78', accent = '#0b7a75';

    // Encabezado
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(18).text(business.name || 'Turi Express MX', 48, 48);
    doc.font('Helvetica').fontSize(9).fillColor(muted)
      .text([business.legal_name, business.address, business.city, business.phone ? `WhatsApp ${business.phone}` : null].filter(Boolean).join(' · '));
    doc.font('Helvetica-Bold').fontSize(11).fillColor(accent)
      .text(`CONTRATO DE ARRENDAMIENTO ${r.folio}`, 48, 48, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(muted)
      .text(`Estado: ${STATUS_LABEL[r.status] ?? r.status}`, { width: W, align: 'right' })
      .text(`Emitido: ${fmtDate(new Date())}`, { width: W, align: 'right' });
    doc.moveTo(48, 100).lineTo(48 + W, 100).strokeColor('#d5dde3').stroke();
    doc.y = 112;

    const section = (title: string) => {
      doc.moveDown(0.6).font('Helvetica-Bold').fontSize(10).fillColor(accent).text(title.toUpperCase(), 48);
      doc.moveDown(0.2);
    };
    const rows = (pairs: [string, string | number | null | undefined][]) => {
      const colW = W / 2;
      for (let i = 0; i < pairs.length; i += 2) {
        const y = doc.y;
        for (let j = 0; j < 2; j++) {
          const pair = pairs[i + j];
          if (!pair) continue;
          const x = 48 + j * colW;
          doc.font('Helvetica').fontSize(8).fillColor(muted).text(pair[0], x, y, { width: colW - 10 });
          doc.font('Helvetica').fontSize(10).fillColor(ink).text(String(pair[1] ?? '—') || '—', x, doc.y, { width: colW - 10 });
        }
        doc.y = Math.max(doc.y, y + 26);
      }
    };

    section('Arrendatario');
    rows([
      ['Nombre', r.client_name], ['Teléfono', r.client_phone],
      ['Identificación (INE/pasaporte)', c?.id_document], ['Licencia de conducir', c?.license_number ? `${c.license_number}${c.license_expires ? ` (vence ${fmtDate(c.license_expires)})` : ''}` : null],
      ['Correo', r.client_email ?? c?.email], ['Domicilio', c?.address],
    ]);

    section('Unidad y periodo');
    const days = billableDays(new Date(r.starts_at), new Date(r.ends_at));
    rows([
      ['Unidad', r.vehicle_name ?? 'Por asignar'], ['Placas', r.vehicle_plate],
      ['Entrega', fmt(r.starts_at)], ['Devolución', fmt(r.ends_at)],
      ['Lugar de entrega', r.pickup], ['Días cobrados', days],
      ['Kilometraje salida', r.km_out], ['Combustible salida', r.fuel_out],
      ['Kilometraje regreso', r.km_in], ['Combustible regreso', r.fuel_in],
    ]);

    section('Importes');
    const paid = payments.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount_cents : p.amount_cents), 0);
    rows([
      ['Tarifa diaria', money(r.daily_rate_cents)], ['Tarifa semanal', money(r.weekly_rate_cents)],
      ['Descuento', money(r.discount_cents)], ['Total de la renta', money(r.quote_cents)],
      ['Pagado', money(paid)], ['Saldo pendiente', money((r.quote_cents ?? 0) - paid)],
      ['Depósito en garantía (reembolsable)', money(r.guarantee_cents)], ['Garantía devuelta', r.guarantee_returned ? 'Sí' : 'No'],
    ]);
    if (payments.length) {
      doc.font('Helvetica').fontSize(8).fillColor(muted).text('Pagos registrados:', 48);
      for (const p of payments) {
        doc.fontSize(9).fillColor(ink).text(`• ${fmtDate(p.paid_at)} — ${KIND[p.kind] ?? p.kind} ${money(p.amount_cents)} (${METHOD[p.method] ?? p.method})${p.note ? ` · ${p.note}` : ''}`, 56);
      }
    }
    if (r.notes) {
      section('Observaciones');
      doc.font('Helvetica').fontSize(9).fillColor(ink).text(r.notes, 48, doc.y, { width: W });
    }

    section('Condiciones');
    doc.font('Helvetica').fontSize(8).fillColor(ink);
    CLAUSES.forEach((text, i) => doc.text(`${i + 1}. ${text}`, 48, doc.y, { width: W, paragraphGap: 2 }));
    doc.fontSize(8).fillColor(muted).text('Al firmar, el arrendatario acepta además los Términos y Condiciones publicados en turiexpress.com.mx/terminos.', 48, doc.y + 4, { width: W });

    // Firmas
    if (doc.y > doc.page.height - 150) doc.addPage();
    const y = Math.max(doc.y + 50, doc.page.height - 130);
    const sw = (W - 40) / 2;
    doc.moveTo(48, y).lineTo(48 + sw, y).strokeColor(ink).stroke();
    doc.moveTo(88 + sw, y).lineTo(88 + 2 * sw, y).stroke();
    doc.font('Helvetica').fontSize(9).fillColor(ink)
      .text(`Arrendatario: ${r.client_name}`, 48, y + 6, { width: sw, align: 'center' })
      .text(`Por ${business.name || 'Turi Express MX'}`, 88 + sw, y + 6, { width: sw, align: 'center' });

    doc.end();
  });
}
