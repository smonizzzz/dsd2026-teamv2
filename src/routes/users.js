const router = require('express').Router();
const { getUsers, getUserById, createUser } = require('../controllers/usersController');
router.get('/',    getUsers);
router.get('/:id', getUserById);
router.post('/',   createUser);
module.exports = router;
