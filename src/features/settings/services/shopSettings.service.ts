import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from '@react-native-firebase/firestore';

export type WeekDay = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';

export const ALL_WEEK_DAYS: WeekDay[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

export const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  seg: 'Seg',
  ter: 'Ter',
  qua: 'Qua',
  qui: 'Qui',
  sex: 'Sex',
  sab: 'Sáb',
  dom: 'Dom',
};

/** Intervalos aceitos entre um horário e o seguinte, em minutos */
export const SLOT_STEP_OPTIONS = [15, 30, 60] as const;

/** Antecedência mínima máxima aceita (4h) — acima disso o dia perde utilidade */
export const MAX_MIN_NOTICE_MIN = 240;

export type ShopSettings = {
  openHour: number;
  closeHour: number;
  /** Quantos atendimentos simultâneos a estética suporta (carros ao mesmo tempo) */
  parallelCapacity: number;
  /** Dias da semana em que a estética atende */
  workingDays: WeekDay[];
  /**
   * Intervalo entre os horários oferecidos ao cliente. Independe da duração do
   * serviço: com 30, um serviço de 90min pode começar às 8:00, 8:30, 9:00…
   */
  slotStepMin: number;
  /**
   * Antecedência mínima para agendar. Evita que o cliente marque um horário que
   * começa "agora", dando tempo de chegar até a estética e de preparar o box.
   */
  minNoticeMin: number;
};

/** Padrões de um shop novo. Fonte única — não duplicar estes valores. */
export const SHOP_SETTINGS_DEFAULTS: ShopSettings = {
  openHour: 8,
  closeHour: 18,
  parallelCapacity: 2,
  workingDays: ['seg', 'ter', 'qua', 'qui', 'sex'],
  slotStepMin: 30,
  minNoticeMin: 15,
};

export class ShopSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopSettingsError';
  }
}

function validateHour(hour?: number): number | null {
  return hour != null && hour >= 0 && hour <= 23 ? hour : null;
}

function validateCapacity(capacity?: number): number | null {
  return capacity && capacity >= 1 && capacity <= 10 ? capacity : null;
}

function validateWorkingDays(days?: unknown): WeekDay[] {
  if (!Array.isArray(days)) return SHOP_SETTINGS_DEFAULTS.workingDays;

  const validos = days.filter((d): d is WeekDay => ALL_WEEK_DAYS.includes(d as WeekDay));

  // Lista que esvazia no filtro cai no padrão, igual à lista que já chegou
  // vazia. Devolver [] aqui fazia a estética trabalhar zero dias e sumir do
  // agendamento em silêncio — ninguém olha a configuração para descobrir isso.
  return validos.length > 0 ? validos : SHOP_SETTINGS_DEFAULTS.workingDays;
}

function validateSlotStep(step?: number): number | null {
  return step != null && (SLOT_STEP_OPTIONS as readonly number[]).includes(step) ? step : null;
}

function validateMinNotice(minutes?: number): number | null {
  return minutes != null && minutes >= 0 && minutes <= MAX_MIN_NOTICE_MIN ? minutes : null;
}

function validateAndMergeSettings(data: Partial<ShopSettings>): ShopSettings {
  return {
    openHour: validateHour(data?.openHour) ?? SHOP_SETTINGS_DEFAULTS.openHour,
    closeHour: validateHour(data?.closeHour) ?? SHOP_SETTINGS_DEFAULTS.closeHour,
    parallelCapacity:
      validateCapacity(data?.parallelCapacity) ?? SHOP_SETTINGS_DEFAULTS.parallelCapacity,
    workingDays: validateWorkingDays(data?.workingDays),
    slotStepMin: validateSlotStep(data?.slotStepMin) ?? SHOP_SETTINGS_DEFAULTS.slotStepMin,
    minNoticeMin: validateMinNotice(data?.minNoticeMin) ?? SHOP_SETTINGS_DEFAULTS.minNoticeMin,
  };
}

function hasSettingsChanged(old: Partial<ShopSettings>, newSettings: ShopSettings): boolean {
  return (Object.keys(newSettings) as Array<keyof ShopSettings>).some(key => {
    if (key === 'workingDays') {
      // `?? []` não basta: o campo vem do Firestore e pode ser qualquer coisa.
      // Com uma string, `.slice()` funciona e `.sort()` estoura — e o erro era
      // engolido pelo catch de fora, virando "falha ao carregar configurações".
      // A loja ficava sem horário nenhum por causa de um campo torto.
      const antigos = Array.isArray(old.workingDays) ? old.workingDays : [];
      const a = antigos.slice().sort().join(',');
      const b = newSettings.workingDays.slice().sort().join(',');
      return a !== b;
    }
    return old[key] !== newSettings[key];
  });
}

function settingsRef(shopId: string) {
  return doc(getFirestore(), 'shops', shopId, 'settings', 'config');
}

export async function ensureShopSettings(shopId: string): Promise<{
  created: boolean;
  settings: ShopSettings;
}> {
  const ref = settingsRef(shopId);

  try {
    const snap = await getDoc(ref);

    if (!snap.exists) {
      await setDoc(ref, {
        ...SHOP_SETTINGS_DEFAULTS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { created: true, settings: SHOP_SETTINGS_DEFAULTS };
    }

    const data = snap.data() as Partial<ShopSettings>;
    const merged = validateAndMergeSettings(data);

    if (hasSettingsChanged(data, merged)) {
      // Persistir os padrões é conveniência, não requisito: o cliente passa por
      // aqui ao montar os horários e NÃO tem permissão de escrita nas settings
      // (ver firestore.rules). Falhar a gravação não pode quebrar a leitura —
      // os valores mesclados em memória já bastam. O dono regrava no próximo
      // acesso à tela de gestão.
      try {
        await setDoc(ref, { ...merged, updatedAt: serverTimestamp() }, { merge: true });
      } catch {
        // sem permissão (cliente) ou rede: segue com os valores em memória
      }
    }

    return { created: false, settings: merged };
  } catch {
    throw new ShopSettingsError('Falha ao carregar configurações da loja');
  }
}

export async function getShopSettings(shopId: string): Promise<ShopSettings> {
  const { settings } = await ensureShopSettings(shopId);
  return settings;
}

export async function updateShopSettings(
  shopId: string,
  updates: Partial<ShopSettings>,
): Promise<ShopSettings> {
  const ref = settingsRef(shopId);
  const current = await getShopSettings(shopId);
  const merged = validateAndMergeSettings({ ...current, ...updates });

  await setDoc(ref, { ...merged, updatedAt: serverTimestamp() }, { merge: true });

  return merged;
}
