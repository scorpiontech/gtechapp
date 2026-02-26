import { useEffect } from 'react';
import { MikWebCliente } from '@/types/mikweb';
import { supabase } from '@/integrations/supabase/client';

/**
 * Registers the device for push notifications.
 * For web: requests permission and stores a placeholder (full Web Push requires VAPID keys + service worker).
 * For native (Capacitor): uses @capacitor/push-notifications when available.
 */
export function usePushRegistration(cliente: MikWebCliente | null) {
  useEffect(() => {
    if (!cliente) return;

    const registerPush = async () => {
      try {
        // Detect platform
        const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

        if (isNative) {
          await registerNativePush(cliente.id);
        } else {
          await registerWebPush(cliente.id);
        }
      } catch {
        // Silent - push registration is non-critical
      }
    };

    registerPush();
  }, [cliente]);
}

async function registerWebPush(clienteId: number) {
  if (!('Notification' in window)) return;

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
  }

  // For full Web Push, you need VAPID keys and service worker subscription.
  // This stores a placeholder token. Replace with real subscription when FCM is configured.
  const token = `web_${clienteId}_${Date.now()}`;

  await saveToken(clienteId, token, 'web');
}

async function registerNativePush(clienteId: number) {
  try {
    // Dynamic import for Capacitor Push Notifications
    // @ts-ignore - dynamic import, package installed only in native builds
    const { PushNotifications } = await import(/* @vite-ignore */ '@capacitor/push-notifications');

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (pushToken) => {
      const platform = (window as any).Capacitor?.getPlatform?.() === 'ios' ? 'ios' : 'android';
      await saveToken(clienteId, pushToken.value, platform);
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });
  } catch {
    // @capacitor/push-notifications not installed or not on native
  }
}

async function saveToken(clienteId: number, token: string, platform: string) {
  try {
    await supabase.from('device_tokens').upsert(
      {
        cliente_id: clienteId,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cliente_id,token' }
    );
  } catch {
    // Silent
  }
}
