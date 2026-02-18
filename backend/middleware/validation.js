const validateProject = (req, res, next) => {
  const { type, name, deadline } = req.body;
  const errors = [];

  if (!type) errors.push('Le type de projet est requis');
  if (!name) errors.push('Le nom du projet est requis');
  if (!deadline) errors.push('La date limite est requise');

  if (deadline) {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    if (deadlineDate < today) {
      errors.push('La date limite doit être dans le futur');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

const validateInvite = (req, res, next) => {
  const { emails } = req.body;
  const errors = [];

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    errors.push('Au moins un email est requis');
  }

  if (emails && emails.length > 100) {
    errors.push('Maximum 100 invités par projet');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidEmails = emails?.filter(email => !emailRegex.test(email));
  if (invalidEmails?.length > 0) {
    errors.push(`Emails invalides: ${invalidEmails.join(', ')}`);
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

const validateContribution = (req, res, next) => {
  const { message } = req.body;
  const errors = [];

  if (!message || message.trim().length === 0) {
    errors.push('Le message est requis');
  }

  if (message && message.length > 1000) {
    errors.push('Le message ne peut pas dépasser 1000 caractères');
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateProject, validateInvite, validateContribution };