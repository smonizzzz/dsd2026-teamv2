const router = require('express').Router();
const { getUsers, getUserById, createUser, updateUser, getLicense } = require('../controllers/usersController');
router.get('/',     getUsers);
router.get('/:id',  getUserById);
router.post('/',    createUser);
router.patch('/:id',         updateUser);
router.get('/:id/license',   getLicense);
module.exports = router;
