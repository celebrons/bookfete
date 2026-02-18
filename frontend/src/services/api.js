// C:\Users\USER\bookfete\frontend\src\services\api.js
import { supabase } from './supabaseClient';

/**
 * Fonction fetch spéciale pour ngrok avec logs ultra-détaillés
 */
export const fetchWithNgrok = async (url, options = {}) => {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 FETCH WITH NGROK - DÉBUT');
  console.log('='.repeat(60));
  console.log('📡 URL:', url);
  console.log('📦 Options initiales:', JSON.stringify(options, null, 2));
  
  try {
    // Récupérer le token
    console.log('\n🔐 Récupération du token...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('❌ Erreur session:', sessionError);
    }
    
    const token = session?.access_token;
    console.log('🔑 Token présent:', !!token);
    if (token) {
      console.log('📝 Token (début):', token.substring(0, 20) + '...');
    }

    // Construction des en-têtes
    const headers = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': 'Mozilla/5.0 (compatible; AppTest/1.0)',
      'X-Request-ID': Date.now().toString(),
      ...options.headers
    };

    console.log('\n📋 En-têtes construits:');
    Object.keys(headers).forEach(key => {
      const value = key === 'Authorization' ? 'Bearer [HIDDEN]' : headers[key];
      console.log(`   ${key}: ${value}`);
    });

    // Ajouter le token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Configuration de la requête
    const fetchOptions = {
      ...options,
      headers,
      credentials: 'include',
      mode: 'cors',
      cache: 'no-cache'
    };

    console.log('\n⚙️ Options finales:', {
      method: fetchOptions.method || 'GET',
      credentials: fetchOptions.credentials,
      mode: fetchOptions.mode,
      cache: fetchOptions.cache
    });

    // PREMIÈRE TENTATIVE
    console.log('\n🚀 Tentative 1 - Envoi de la requête...');
    console.time('⏱️ Durée requête');
    
    let response;
    try {
      response = await fetch(url, fetchOptions);
      console.timeEnd('⏱️ Durée requête');
    } catch (fetchError) {
      console.timeEnd('⏱️ Durée requête');
      console.error('❌ Erreur fetch (réseau):', {
        name: fetchError.name,
        message: fetchError.message,
        stack: fetchError.stack
      });
      throw fetchError;
    }

    // Analyse de la réponse
    console.log('\n📨 RÉPONSE REÇUE:');
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   URL finale: ${response.url}`);
    console.log(`   Type: ${response.type}`);
    console.log(`   OK: ${response.ok}`);
    console.log(`   Redirected: ${response.redirected}`);

    // Headers de la réponse
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    console.log('   Headers:', responseHeaders);

    // Vérifier le type de contenu
    const contentType = response.headers.get('content-type');
    console.log(`\n📄 Content-Type: ${contentType}`);

    if (contentType && contentType.includes('text/html')) {
      console.warn('⚠️ HTML DÉTECTÉ! C\'est la page d\'avertissement ngrok');
      
      // Lire le début de la réponse HTML pour confirmer
      const text = await response.text();
      console.log('📄 Début de la réponse HTML:', text.substring(0, 500));
      
      console.log('\n🔄 TENTATIVE 2 - Avec User-Agent différent...');
      
      // Deuxième tentative avec User-Agent différent
      const retryOptions = {
        ...fetchOptions,
        headers: {
          ...fetchOptions.headers,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };
      
      console.time('⏱️ Durée requête 2');
      response = await fetch(url, retryOptions);
      console.timeEnd('⏱️ Durée requête 2');
      
      const retryContentType = response.headers.get('content-type');
      console.log(`📄 Nouveau Content-Type: ${retryContentType}`);
      
      if (retryContentType && retryContentType.includes('text/html')) {
        console.error('❌ Toujours du HTML après tentative 2');
        const retryText = await response.text();
        console.log('📄 HTML reçu:', retryText.substring(0, 500));
        throw new Error('Page d\'avertissement ngrok persistante');
      }
    }

    // Si on arrive ici, c'est que la réponse n'est pas du HTML
    console.log('\n✅ Réponse semble OK (pas de HTML détecté)');
    
    // Tenter de lire le JSON (si possible)
    try {
      const clone = response.clone();
      const jsonData = await clone.json();
      console.log('📦 JSON reçu:', jsonData);
    } catch (e) {
      console.log('⚠️ Impossible de parser en JSON (normal si pas encore lu)');
    }

    console.log('='.repeat(60));
    console.log('✅ FIN fetchWithNgrok\n');
    
    return response;
    
  } catch (error) {
    console.error('\n❌ ERREUR CATASTROPHIQUE:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    console.error('   Name:', error.name);
    if (error.cause) {
      console.error('   Cause:', error.cause);
    }
    console.log('='.repeat(60) + '\n');
    throw error;
  }
};

/**
 * Version simplifiée pour GET
 */
export const get = async (url) => {
  console.log('📡 GET:', url);
  return fetchWithNgrok(url);
};

/**
 * Version simplifiée pour POST
 */
export const post = async (url, data) => {
  console.log('📡 POST:', url);
  console.log('📦 Données:', data);
  return fetchWithNgrok(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
};

/**
 * Version simplifiée pour PUT
 */
export const put = async (url, data) => {
  console.log('📡 PUT:', url);
  return fetchWithNgrok(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
};

/**
 * Version simplifiée pour DELETE
 */
export const del = async (url) => {
  console.log('📡 DELETE:', url);
  return fetchWithNgrok(url, {
    method: 'DELETE'
  });
};