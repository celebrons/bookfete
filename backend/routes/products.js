// backend/routes/products.js
//
// Grille tarifaire (book_products) : lecture publique. Remplace les
// paliers de pages codes en dur cote frontend.

const express = require('express');
const router = express.Router();
const productCatalog = require('../services/composition/productCatalog');

// GET /api/catalog/products
router.get('/api/catalog/products', async (_req, res) => {
  try {
    const data = await productCatalog.listActiveProducts();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
