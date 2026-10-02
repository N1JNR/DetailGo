import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

import { validarCoordenadas, validarEndereco } from './coordenadas';
import { dentroDoLimite, extrairIp } from './limitePorIp';

const googleGeocodingKey = defineSecret('GOOGLE_GEOCODING_KEY');

type AddressComponent = {
  types: string[];
  long_name: string;
};

function extractComponents(components: AddressComponent[]) {
  const get = (type: string) => components.find(c => c.types.includes(type))?.long_name ?? '';

  const route = get('route');
  const neighborhood = get('sublocality_level_1') || get('neighborhood');
  const city = get('administrative_area_level_2');
  const state = get('administrative_area_level_1');
  const postalCode = get('postal_code').replace(/\D/g, '');
  const addressParts = [route, neighborhood].filter(Boolean);

  return {
    address: addressParts.join(', '),
    city: city && state ? `${city} - ${state}` : city || state,
    cep: postalCode || undefined,
  };
}

/**
 * Proxy para Google Maps Geocoding API.
 * Mantém a chave no servidor — nunca exposta no cliente.
 * Body: { address: string }
 * Response: { lat: number, lng: number }
 */
export const geocode = onRequest(
  { secrets: [googleGeocodingKey], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const validacao = validarEndereco(req.body);
    if (!validacao.ok) {
      res.status(400).json({ error: validacao.erro });
      return;
    }
    const address = validacao.endereco;

    // Só a tela de cadastro chama isto, antes de a conta existir — por isso não
    // dá para exigir login. O teto por IP corta o abuso automatizado.
    const veredito = await dentroDoLimite(admin.firestore(), extrairIp(req.headers), Date.now());
    if (!veredito.permitido) {
      res.status(veredito.status).json({ error: veredito.erro });
      return;
    }

    try {
      const key = googleGeocodingKey.value();
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address,
      )}&region=br&language=pt-BR&key=${key}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results?.length) {
        res.status(404).json({ error: 'Endereço não encontrado', status: data.status });
        return;
      }

      const loc = data.results[0].geometry.location;
      res.json({ lat: loc.lat, lng: loc.lng });
    } catch {
      res.status(500).json({ error: 'Erro interno' });
    }
  },
);

/**
 * Proxy para Google Maps Reverse Geocoding API.
 * Body: { lat: number, lng: number }
 * Response: { address: string, city: string, cep?: string }
 */
export const reverseGeocode = onRequest(
  { secrets: [googleGeocodingKey], cors: false },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const validacao = validarCoordenadas(req.body);
    if (!validacao.ok) {
      res.status(400).json({ error: validacao.erro });
      return;
    }
    const { lat, lng } = validacao.coords;

    const veredito = await dentroDoLimite(admin.firestore(), extrairIp(req.headers), Date.now());
    if (!veredito.permitido) {
      res.status(veredito.status).json({ error: veredito.erro });
      return;
    }

    try {
      const key = googleGeocodingKey.value();
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=pt-BR&region=br&key=${key}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results?.length) {
        res.status(404).json({ error: 'Endereço não encontrado' });
        return;
      }

      const result = data.results[0];
      const extracted = extractComponents(result.address_components ?? []);

      res.json({
        address: extracted.address || result.formatted_address,
        city: extracted.city,
        cep: extracted.cep,
      });
    } catch {
      res.status(500).json({ error: 'Erro interno' });
    }
  },
);
