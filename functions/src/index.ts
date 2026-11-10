import * as admin from 'firebase-admin';

admin.initializeApp();

export { createAsaasCheckout } from './payment/createAsaasCheckout';
export { getAsaasSubscription, cancelAsaasSubscription } from './payment/asaasSubscription';
export { asaasWebhook } from './payment/asaasWebhook';
export { checkTrialExpiry } from './scheduled/checkTrialExpiry';
export { checkSubscriptionExpiry } from './scheduled/checkSubscriptionExpiry';
export { geocode, reverseGeocode } from './geo/geocode';
export { deleteAccount } from './account/deleteAccount';
export { onAppointmentCreated } from './notifications/onAppointmentCreated';
export { sendAppointmentReminders } from './notifications/sendAppointmentReminders';
export { notifyExpiredAppointments } from './notifications/notifyExpiredAppointments';
export { onAppointmentStatusChanged } from './appointments/onAppointmentStatusChanged';
