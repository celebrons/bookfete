import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { listOrders } from '../../services/ordersApi';
import { getOrderStatusConfig } from '../../utils/orderWorkflow';
import AddressAutocomplete from '../common/AddressAutocomplete';
import '../../styles/luxe-theme.css';
import './AccountSpaceLuxe.css';

const DEFAULT_ADDRESS = {
  fullName: '',
  line1: '',
  line2: '',
  postalCode: '',
  city: '',
  country: 'France',
  phone: ''
};

const AccountSpaceLuxe = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [user, setUser] = useState(null);
  const [books, setBooks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [addressForm, setAddressForm] = useState(DEFAULT_ADDRESS);
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [savingAddress, setSavingAddress] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const loadAccountData = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const authUser = session?.user || null;
        if (!authUser) {
          navigate('/login');
          return;
        }

        setUser(authUser);

        const metadataAddress = authUser.user_metadata?.shipping_address || {};
        setAddressForm({
          ...DEFAULT_ADDRESS,
          ...metadataAddress
        });

        setLoading(false);

        const booksPromise = supabase
          .from('books')
          .select('id, title, created_at')
          .eq('owner_id', authUser.id)
          .order('created_at', { ascending: false });

        const [booksResult, ordersResult] = await Promise.allSettled([
          booksPromise,
          listOrders()
        ]);

        if (booksResult.status === 'fulfilled') {
          if (booksResult.value?.error) {
            throw booksResult.value.error;
          }
          setBooks(Array.isArray(booksResult.value?.data) ? booksResult.value.data : []);
        } else {
          setNotice({
            type: 'error',
            message: `Projets: ${booksResult.reason?.message || 'chargement impossible'}`
          });
        }

        if (ordersResult.status === 'fulfilled') {
          setOrders(Array.isArray(ordersResult.value) ? ordersResult.value : []);
        } else {
          setNotice({
            type: 'error',
            message: `Commandes: ${ordersResult.reason?.message || 'chargement impossible'}`
          });
        }
      } catch (error) {
        setNotice({
          type: 'error',
          message: `Impossible de charger votre espace: ${error.message}`
        });
      } finally {
        setLoadingBooks(false);
        setLoadingOrders(false);
        setLoading(false);
      }
    };

    loadAccountData();
  }, [navigate]);

  const projectCount = books.length;
  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  // Adresse REELLEMENT enregistree sur le compte, mise en une ligne lisible.
  // Lue depuis user_metadata et non depuis addressForm : le formulaire peut
  // contenir une saisie en cours, non sauvegardee — les confondre reviendrait
  // a afficher comme "enregistre" ce qui ne l est pas.
  const adresseEnregistree = useMemo(() => {
    const a = user?.user_metadata?.shipping_address;
    if (!a || typeof a !== 'object') return '';
    const lignes = [
      a.fullName,
      a.line1,
      a.line2,
      [a.postalCode, a.city].filter(Boolean).join(' '),
      a.country,
      a.phone
    ].map((v) => String(v || '').trim()).filter(Boolean);
    // Une adresse sans rue ni ville n est pas une adresse : on prefere ne rien
    // annoncer plutot que d afficher un nom seul comme "votre adresse".
    if (!String(a.line1 || '').trim() && !String(a.city || '').trim()) return '';
    return lignes.join(' · ');
  }, [user]);

  const setAddressField = (event) => {
    const { name, value } = event.target;
    setAddressForm((prev) => ({ ...prev, [name]: value }));
  };

  const setPasswordField = (event) => {
    const { name, value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveAddress = async (event) => {
    event.preventDefault();
    setSavingAddress(true);
    setNotice(null);

    try {
      if (!user) return;

      const payload = {
        ...addressForm,
        updatedAt: new Date().toISOString()
      };

      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata || {}),
          shipping_address: payload
        }
      });

      if (error) throw error;
      if (data?.user) {
        setUser(data.user);
      }

      setNotice({
        type: 'success',
        message: 'Adresse enregistree.'
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: `Erreur sauvegarde adresse: ${error.message}`
      });
    } finally {
      setSavingAddress(false);
    }
  };

  const updatePassword = async (event) => {
    event.preventDefault();
    setSavingPassword(true);
    setNotice(null);

    try {
      if (passwordForm.newPassword.length < 8) {
        throw new Error('Le mot de passe doit contenir au moins 8 caracteres.');
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('Les mots de passe ne correspondent pas.');
      }

      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword
      });

      if (error) throw error;

      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setNotice({
        type: 'success',
        message: 'Mot de passe mis a jour.'
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: `Erreur mise a jour mot de passe: ${error.message}`
      });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="account-page">
        <div className="container-luxe account-shell">
          <p className="account-loading">Chargement de votre espace client...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="account-page">
      <div className="container-luxe account-shell">
        <header className="account-hero card-luxe">
          <div className="label-gold">Mon espace</div>
          <h1>Espace client</h1>
          <p>
            Retrouvez vos commandes, vos projets, vos adresses et la securite de votre compte.
          </p>
        </header>

        {notice?.message && (
          <div className={`account-notice is-${notice.type || 'info'}`}>
            {notice.message}
          </div>
        )}

        <section className="account-grid">
          <article className="account-panel">
            <div className="account-panel-head">
              <h2>Mes commandes</h2>
              <span className="account-badge">{orders.length}</span>
            </div>

            {loadingOrders ? (
              <p className="account-muted">Chargement des commandes...</p>
            ) : orders.length === 0 ? (
              <p className="account-muted">Aucune commande pour le moment.</p>
            ) : (
              <ul className="account-list">
                {recentOrders.map((order) => {
                  const statusConfig = getOrderStatusConfig(order.status);
                  return (
                    <li key={order.id} className="account-list-item">
                      <div>
                        <strong>{order.book_title || 'Livre sans titre'}</strong>
                        <span>{statusConfig.label}</span>
                      </div>
                      <Link to="/orders" className="account-link">
                        Voir
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="account-actions">
              <Link to="/orders" className="btn btn-outline">
                Gerer mes commandes
              </Link>
            </div>
          </article>

          <article className="account-panel">
            <div className="account-panel-head">
              <h2>Mes projets</h2>
              <span className="account-badge">{projectCount}</span>
            </div>

            {loadingBooks ? (
              <p className="account-muted">Chargement des projets...</p>
            ) : projectCount === 0 ? (
              <p className="account-muted">Aucun projet enregistre.</p>
            ) : (
              <ul className="account-list">
                {books.slice(0, 6).map((book) => (
                  <li key={book.id} className="account-list-item">
                    <div>
                      <strong>{book.title || 'Livre sans titre'}</strong>
                      <span>Creer le {new Date(book.created_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                    <Link to={`/book/${book.id}`} className="account-link">
                      Editer
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="account-actions">
              <Link to="/dashboard" className="btn btn-outline">
                Voir tous mes projets
              </Link>
            </div>
          </article>

          <article className="account-panel">
            <div className="account-panel-head">
              <h2>Mes adresses</h2>
            </div>

            {/* L ADRESSE ENREGISTREE, en toutes lettres. Le formulaire seul ne
                disait jamais ce qui etait REELLEMENT en base : on ne pouvait pas
                distinguer une adresse sauvegardee d une saisie en cours, ni
                savoir de quand elle datait (retour utilisateur 2026-09-14 :
                "lorsqu on enregistre une adresse, on la voit pas"). Cette
                carte lit user_metadata, pas le formulaire. */}
            {adresseEnregistree ? (
              <div className="account-address-saved">
                <span className="account-address-saved-label">Adresse enregistrée</span>
                <p className="account-address-saved-text">{adresseEnregistree}</p>
                <p className="account-address-saved-hint">
                  Elle est utilisée pour pré-remplir vos commandes. Modifiez-la ci-dessous si besoin.
                </p>
              </div>
            ) : (
              <p className="account-address-saved-hint">
                Aucune adresse enregistrée pour le moment. Elle servira à pré-remplir vos commandes.
              </p>
            )}

            <form className="account-form" onSubmit={saveAddress}>
              <label htmlFor="fullName">Nom complet</label>
              <input
                id="fullName"
                name="fullName"
                className="input-luxe"
                value={addressForm.fullName}
                onChange={setAddressField}
                placeholder="Ex: Marie Dupont"
              />

              <label htmlFor="line1">Adresse</label>
              {/* Suggestions officielles (Base Adresse Nationale) : choisir une
                  proposition remplit aussi le code postal et la ville. Voir
                  AddressAutocomplete.js — jamais bloquant, saisie libre
                  toujours possible. */}
              <AddressAutocomplete
                field="line1"
                value={addressForm.line1}
                address={addressForm}
                onChangeField={setAddressField}
                placeholder="Ex: 12 rue de la Paix"
              />

              <label htmlFor="line2">Complement</label>
              <input
                id="line2"
                name="line2"
                className="input-luxe"
                value={addressForm.line2}
                onChange={setAddressField}
                placeholder="Batiment, etage, etc."
              />

              <div className="account-form-row">
                <div>
                  <label htmlFor="postalCode">Code postal</label>
                  <AddressAutocomplete
                    field="postalCode"
                    value={addressForm.postalCode}
                    address={addressForm}
                    onChangeField={setAddressField}
                    placeholder="75000"
                  />
                </div>
                <div>
                  <label htmlFor="city">Ville</label>
                  <input
                    id="city"
                    name="city"
                    className="input-luxe"
                    value={addressForm.city}
                    onChange={setAddressField}
                    placeholder="Paris"
                  />
                </div>
              </div>

              <div className="account-form-row">
                <div>
                  <label htmlFor="country">Pays</label>
                  <input
                    id="country"
                    name="country"
                    className="input-luxe"
                    value={addressForm.country}
                    onChange={setAddressField}
                    placeholder="France"
                  />
                </div>
                <div>
                  <label htmlFor="phone">Telephone</label>
                  <input
                    id="phone"
                    name="phone"
                    className="input-luxe"
                    value={addressForm.phone}
                    onChange={setAddressField}
                    placeholder="06 00 00 00 00"
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={savingAddress}>
                {savingAddress ? 'Enregistrement...' : 'Enregistrer adresse'}
              </button>
            </form>
          </article>

          <article className="account-panel">
            <div className="account-panel-head">
              <h2>Changer mot de passe</h2>
            </div>
            <form className="account-form" onSubmit={updatePassword}>
              <label htmlFor="newPassword">Nouveau mot de passe</label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                className="input-luxe"
                value={passwordForm.newPassword}
                onChange={setPasswordField}
                placeholder="Minimum 8 caracteres"
                autoComplete="new-password"
              />

              <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                className="input-luxe"
                value={passwordForm.confirmPassword}
                onChange={setPasswordField}
                placeholder="Saisir a nouveau"
                autoComplete="new-password"
              />

              <button type="submit" className="btn btn-primary" disabled={savingPassword}>
                {savingPassword ? 'Mise a jour...' : 'Mettre a jour'}
              </button>
            </form>
          </article>
        </section>
      </div>
    </div>
  );
};

export default AccountSpaceLuxe;
