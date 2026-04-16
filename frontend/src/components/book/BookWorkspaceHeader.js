import React from 'react';
import { useNavigate } from 'react-router-dom';
import Tooltip from '../ui/Tooltip';

const HomeLineIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6.5 9.5V20h11V9.5" />
    <path d="M10 20v-5.5h4V20" />
  </svg>
);

const BookLineIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 5.5A2.5 2.5 0 0 1 9 3h9v17h-9a2.5 2.5 0 0 0-2.5 2" />
    <path d="M6.5 5.5V22" />
    <path d="M9 6.5h6" />
  </svg>
);

const UsersLineIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.5 19a4.5 4.5 0 0 0-9 0" />
    <circle cx="12" cy="9" r="3" />
    <path d="M20 18a3.5 3.5 0 0 0-2.8-3.4" />
    <path d="M17.2 5.8a2.7 2.7 0 0 1 0 5.4" />
  </svg>
);

const SlidersLineIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 6h14" />
    <path d="M5 18h14" />
    <path d="M5 12h14" />
    <circle cx="9" cy="6" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="11" cy="18" r="1.8" fill="currentColor" stroke="none" />
  </svg>
);

const normalizeText = (value) => (value === null || value === undefined ? '' : String(value).trim());

const getDisplayBookTitle = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return normalized.replace(/^(?:\[[^\]]+\]\s*)+/g, '').trim() || normalized;
};

const NAV_ITEMS = [
  { key: 'chapitres', label: 'Edition', icon: BookLineIcon },
  { key: 'contributeurs', label: 'Contributeurs', icon: UsersLineIcon },
  { key: 'config', label: 'Configuration', icon: SlidersLineIcon }
];

const BookWorkspaceHeader = ({
  sectionLabel,
  bookTitle,
  activeTab,
  onOpenTab,
  subactions = null
}) => {
  const navigate = useNavigate();
  const displayBookTitle = getDisplayBookTitle(bookTitle || 'Livre');

  return (
    <div className="book-workspace-header-shell">
      <div className="chapter-editor-topbar workspace-topbar book-workspace-topbar">
        <div className="chapter-editor-topbar-left">
          <Tooltip text="Tableau de bord" position="bottom">
            <button
              type="button"
              className="chapter-editor-backlink book-topbar-icon-link"
              onClick={() => navigate('/dashboard')}
              aria-label="Retour au tableau de bord"
            >
              <HomeLineIcon />
            </button>
          </Tooltip>
        </div>

        <div className="chapter-editor-topbar-center">
          <strong className="chapter-editor-chapter-title">{`${sectionLabel} - ${displayBookTitle}`}</strong>
        </div>

        <div className="chapter-editor-topbar-right">
          <div className="book-workspace-nav-group" aria-label="Navigation du livre">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Tooltip key={item.key} text={item.label} position="bottom">
                  <button
                    type="button"
                    className={`chapter-editor-link book-topbar-icon-link ${activeTab === item.key ? 'is-active' : ''}`}
                    onClick={() => onOpenTab?.(item.key)}
                    aria-label={item.label}
                  >
                    <Icon />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>

      {subactions ? <div className="book-workspace-subactions">{subactions}</div> : null}
    </div>
  );
};

export default BookWorkspaceHeader;
