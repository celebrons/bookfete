import React, { useEffect, useMemo, useState } from 'react';
import SupprimerMonCompte from './SupprimerMonCompte';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation('account');
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
            message: `${t('errors.projects')}: ${booksResult.reason?.message || t('errors.loadFailed')}`
          });
        }

        if (ordersResult.status === 'fulfilled') {
          setOrders(Array.isArray(ordersResult.value) ? ordersResult.value : []);
        } else {
          setNotice({
            type: 'error',
            message: `${t('errors.orders')}: ${ordersResult.reason?.message || t('errors.loadFailed')}`
          });
        }
      } catch (error) {
        setNotice({
          type: 'error',
          message: `${t('errors.loadSpaceFailed')}: ${error.message}`
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
        message: t('success.addressSaved')
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: `${t('errors.saveAddressFailed')}: ${error.message}`
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
        throw new Error(t('errors.passwordTooShort'));
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error(t('errors.passwordMismatch'));
      }

      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword
      });

      if (error) throw error;

      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setNotice({
        type: 'success',
        message: t('success.passwordUpdated')
      });
    } catch (error) {
      setNotice({
        type: 'error',
        message: `${t('errors.updatePasswordFailed')}: ${error.message}`
      });
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="account-page">
        <div className="container-luxe account-shell">
          <p className="account-loading">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="account-page">
      <div className="container-luxe account-shell">
        <header className="account-hero">
          <div>
            <h1>{t('hero.title')}</h1>
            <p>{t('hero.subtitle')}</p>
          </div>
        </header>

        {notice?.message && (
          <div className={`account-notice is-${notice.type || 'info'}`}>
            {notice.message}
          </div>
        )}

        <section className="account-grid">
          <article className="account-panel">
            <div className="account-panel-head">
              <h2>{t('orders.title')}</h2>
              <span className="account-badge">{orders.length}</span>
            </div>

            {loadingOrders ? (
              <p className="account-muted">{t('orders.loading')}</p>
            ) : orders.length === 0 ? (
              <p className="account-muted">{t('orders.empty')}</p>
            ) : (
              <ul className="account-list">
                {recentOrders.map((order) => {
                  const statusConfig = getOrderStatusConfig(order.status);
                  return (
                    <li key={order.id} className="account-list-item">
                      <div>
                        <strong>{order.book_title || t('orders.untitledBook')}</strong>
                        <span>{statusConfig.label}</span>
                      </div>
                      <Link to="/orders" className="account-link">
                        {t('orders.view')}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="account-actions">
              <Link to="/orders" className="btn btn-outline">
                {t('orders.manage')}
              </Link>
            </div>
          </article>

          <article className="account-panel">
            <div className="account-panel-head">
              <h2>{t('projects.title')}</h2>
              <span className="account-badge">{projectCount}</span>
            </div>

            {loadingBooks ? (
              <p className="account-muted">{t('projects.loading')}</p>
            ) : projectCount === 0 ? (
              <p className="account-muted">{t('projects.empty')}</p>
            ) : (
              <ul className="account-list">
                {books.slice(0, 6).map((book) => (
                  <li key={book.id} className="account-list-item">
                    <div>
                      <strong>{book.title || t('projects.untitledBook')}</strong>
                      <span>{t('projects.createdOn')} {new Date(book.created_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'fr-FR')}</span>
                    </div>
                    <Link to={`/book/${book.id}`} className="account-link">
                      {t('projects.edit')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="account-actions">
              <Link to="/dashboard" className="btn btn-outline">
                {t('projects.viewAll')}
              </Link>
            </div>
          </article>

          <article className="account-panel">
            <div className="account-panel-head">
              <h2>{t('address.title')}</h2>
            </div>

            {/* L ADRESSE ENREGISTREE, en toutes lettres. Le formulaire seul ne
                disait jamais ce qui etait REELLEMENT en base : on ne pouvait pas
                distinguer une adresse sauvegardee d une saisie en cours, ni
                savoir de quand elle datait (retour utilisateur 2026-09-14 :
                "lorsqu on enregistre une adresse, on la voit pas"). Cette
                carte lit user_metadata, pas le formulaire. */}
            {adresseEnregistree ? (
              <div className="account-address-saved">
                <span className="account-address-saved-label">{t('address.savedLabel')}</span>
                <p className="account-address-saved-text">{adresseEnregistree}</p>
                <p className="account-address-saved-hint">
                  {t('address.savedHint')}
                </p>
              </div>
            ) : (
              <p className="account-address-saved-hint">
                {t('address.noneYet')}
              </p>
            )}

            <form className="account-form" onSubmit={saveAddress}>
              <label htmlFor="fullName">{t('address.fullNameLabel')}</label>
              <input
                id="fullName"
                name="fullName"
                className="input-luxe"
                value={addressForm.fullName}
                onChange={setAddressField}
                placeholder={t('address.fullNamePlaceholder')}
              />

              <label htmlFor="line1">{t('address.line1Label')}</label>
              {/* Suggestions officielles (Base Adresse Nationale) : choisir une
                  proposition remplit aussi le code postal et la ville. Voir
                  AddressAutocomplete.js — jamais bloquant, saisie libre
                  toujours possible. */}
              <AddressAutocomplete
                field="line1"
                value={addressForm.line1}
                address={addressForm}
                onChangeField={setAddressField}
                placeholder={t('address.line1Placeholder')}
              />

              <label htmlFor="line2">{t('address.line2Label')}</label>
              <input
                id="line2"
                name="line2"
                className="input-luxe"
                value={addressForm.line2}
                onChange={setAddressField}
                placeholder={t('address.line2Placeholder')}
              />

              <div className="account-form-row">
                <div>
                  <label htmlFor="postalCode">{t('address.postalCodeLabel')}</label>
                  <AddressAutocomplete
                    field="postalCode"
                    value={addressForm.postalCode}
                    address={addressForm}
                    onChangeField={setAddressField}
                    placeholder="75000"
                  />
                </div>
                <div>
                  <label htmlFor="city">{t('address.cityLabel')}</label>
                  <input
                    id="city"
                    name="city"
                    className="input-luxe"
                    value={addressForm.city}
                    onChange={setAddressField}
                    placeholder={t('address.cityPlaceholder')}
                  />
                </div>
              </div>

              <div className="account-form-row">
                <div>
                  <label htmlFor="country">{t('address.countryLabel')}</label>
                  <input
                    id="country"
                    name="country"
                    className="input-luxe"
                    value={addressForm.country}
                    onChange={setAddressField}
                    placeholder={t('address.countryPlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="phone">{t('address.phoneLabel')}</label>
                  <input
                    id="phone"
                    name="phone"
                    className="input-luxe"
                    value={addressForm.phone}
                    onChange={setAddressField}
                    placeholder={t('address.phonePlaceholder')}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={savingAddress}>
                {savingAddress ? t('address.submitting') : t('address.submit')}
              </button>
            </form>
          </article>

          <article className="account-panel">
            <div className="account-panel-head">
              <h2>{t('password.title')}</h2>
            </div>
            <form className="account-form" onSubmit={updatePassword}>
              <label htmlFor="newPassword">{t('password.newLabel')}</label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                className="input-luxe"
                value={passwordForm.newPassword}
                onChange={setPasswordField}
                placeholder={t('password.newPlaceholder')}
                autoComplete="new-password"
              />

              <label htmlFor="confirmPassword">{t('password.confirmLabel')}</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                className="input-luxe"
                value={passwordForm.confirmPassword}
                onChange={setPasswordField}
                placeholder={t('password.confirmPlaceholder')}
                autoComplete="new-password"
              />

              <button type="submit" className="btn btn-primary" disabled={savingPassword}>
                {savingPassword ? t('password.submitting') : t('password.submit')}
              </button>
            </form>
          </article>
        </section>

        {/* Tout en bas, et discret : personne ne vient dans ses parametres
            pour supprimer son compte. Celui qui le cherche le trouve, les
            autres ne tombent pas dessus. */}
        <SupprimerMonCompte nombreLivres={books.length} nombreCommandes={orders.length} />
      </div>
    </div>
  );
};

export default AccountSpaceLuxe;
