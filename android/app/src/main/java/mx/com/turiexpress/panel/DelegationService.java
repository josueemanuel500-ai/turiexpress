package mx.com.turiexpress.panel;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/**
 * Recibe las notificaciones push del panel (delegadas por Chrome) y las muestra en un canal
 * propio "Rentas" con prioridad alta, sonido y vibración, en lugar del canal genérico.
 */
public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {
    // TrustedWebActivityService deriva el id del canal del nombre: "rentas" + "_channel_id".
    private static final String CHANNEL_NAME = "Rentas";
    private static final String CHANNEL_ID = "rentas_channel_id";
    private static final long[] VIBRATION = {0, 350, 150, 350, 150, 600};

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
    }

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId,
            Notification notification, String channelName) {
        ensureChannel();
        return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, CHANNEL_NAME);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Nuevas solicitudes de renta, entregas y devoluciones");
        channel.enableVibration(true);
        channel.setVibrationPattern(VIBRATION);
        channel.enableLights(true);
        channel.setLightColor(Color.rgb(11, 122, 123));
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        nm.createNotificationChannel(channel);
    }
}
