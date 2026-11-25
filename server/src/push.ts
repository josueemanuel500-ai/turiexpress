import webpush from 'web-push';
import { pool } from './db.js';
import { env } from './env.js';

export const pushEnabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (pushEnabled) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Envía la notificación a todos los dispositivos del personal activo. */
export async function notifyStaff(message: PushMessage, log?: (m: string) => void) {
  if (!pushEnabled) return;
  const { rows } = await pool.query(
    `SELECT p.id,p.endpoint,p.p256dh,p.auth FROM push_subscription p
       JOIN staff_user s ON s.id=p.staff_id WHERE s.active`,
  );
  await Promise.all(rows.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        { TTL: 60 * 60 * 24, urgency: 'high' },
      );
    } catch (error: any) {
      // 404/410: el dispositivo desinstaló la app o revocó el permiso.
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await pool.query('DELETE FROM push_subscription WHERE id=$1', [sub.id]);
      } else {
        log?.(`push falló (${error?.statusCode ?? 'sin código'}): ${error?.body ?? error?.message}`);
      }
    }
  }));
}
