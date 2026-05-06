const router = require('express').Router();
const { getUsers, getUserById, createUser, updateUser } = require('../controllers/usersController');
router.get('/',     getUsers);
router.get('/:id',  getUserById);
router.post('/',    createUser);
router.patch('/:id', updateUser);
module.exports = router;
