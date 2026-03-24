import type { CustomTariffView, SupportedCurrency, TariffConfigView } from './api';

const roundCurrency = (value: number) => Number(value.toFixed(2));

export const convertCurrencyAmount = (
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
  config: TariffConfigView,
) => {
  if (from === to) return roundCurrency(amount);

  if (from === config.monedaBase && to === config.monedaAlterna) {
    return roundCurrency(amount * config.tipoCambio);
  }

  if (from === config.monedaAlterna && to === config.monedaBase) {
    return roundCurrency(amount / Math.max(config.tipoCambio, 0.000001));
  }

  return roundCurrency(amount);
};

export const getNightlyRateInBaseCurrency = (
  nightlyRate: number,
  currency: SupportedCurrency,
  config: TariffConfigView,
) => convertCurrencyAmount(nightlyRate, currency, config.monedaBase, config);

export type TariffQuoteInput = {
  nights: number;
  currentNightlyRate: number;
  config: TariffConfigView;
  selectedCustomTariff?: CustomTariffView | null;
  manualCustomNightlyRate?: number | null;
  manualCustomCurrency?: SupportedCurrency;
  applySeniorDiscount?: boolean;
};

export const buildTariffQuote = ({
  nights,
  currentNightlyRate,
  config,
  selectedCustomTariff,
  manualCustomNightlyRate,
  manualCustomCurrency,
  applySeniorDiscount = false,
}: TariffQuoteInput) => {
  const normalizedNights = Math.max(1, nights);
  const baseNightlyRate = roundCurrency(currentNightlyRate);
  const hasManualCustomRate = Number.isFinite(manualCustomNightlyRate)
    && (manualCustomNightlyRate ?? 0) >= 0
    && Boolean(manualCustomCurrency);
  const appliedNightlyRate = hasManualCustomRate
    ? getNightlyRateInBaseCurrency(manualCustomNightlyRate ?? 0, manualCustomCurrency ?? config.monedaBase, config)
    : selectedCustomTariff
      ? getNightlyRateInBaseCurrency(selectedCustomTariff.montoNoche, selectedCustomTariff.moneda, config)
      : baseNightlyRate;
  const subtotal = roundCurrency(appliedNightlyRate * normalizedNights);
  const seniorDiscount = applySeniorDiscount
    ? roundCurrency(subtotal * (config.descuentoTerceraEdad / 100))
    : 0;
  const taxableTotal = roundCurrency(Math.max(0, subtotal - seniorDiscount));
  const taxAmount = roundCurrency(taxableTotal * (config.porcentajeImpuesto / 100));
  const total = roundCurrency(taxableTotal + taxAmount);
  const totalAlternate = convertCurrencyAmount(total, config.monedaBase, config.monedaAlterna, config);

  return {
    nights: normalizedNights,
    currency: config.monedaBase,
    alternateCurrency: config.monedaAlterna,
    baseNightlyRate,
    appliedNightlyRate,
    subtotal,
    seniorDiscount,
    taxAmount,
    total,
    totalAlternate,
    sourceLabel: hasManualCustomRate ? 'Tarifa manual' : selectedCustomTariff ? selectedCustomTariff.nombre : 'Tarifa actual',
    usesCustomTariff: hasManualCustomRate || Boolean(selectedCustomTariff),
  };
};
