const express = require('express');
const { verifierJWT, garderRole } = require('../middleware/auth');
const statsController = require('../controllers/statsController');

const router = express.Router();

router.get('/', verifierJWT, garderRole('admin'), async (req, res, next) => {
  try {
    const stats = await statsController.obtenirStats();
    res.json(stats);
  } catch (err) { next(err); }
});

module.exports = router;