const formatDate = (date) => {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

const daysBetween = (date1, date2) => {
  const diff = Math.abs(new Date(date1) - new Date(date2));
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const generateToken = () => {
  return require('crypto').randomBytes(32).toString('hex');
};

const sanitizeHtml = (text) => {
  // Supprimer les balises HTML potentiellement dangereuses
  return text.replace(/<[^>]*>?/gm, '');
};

const truncateText = (text, maxLength) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

module.exports = {
  formatDate,
  daysBetween,
  generateToken,
  sanitizeHtml,
  truncateText
};