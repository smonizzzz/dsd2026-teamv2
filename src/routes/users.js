const router = require('express').Router();
const { getUsers, getUserById, createUser, updateUser, getLicense, updateLicense } = require('../controllers/usersController');
const upload = require('../middleware/upload');

router.get('/',     getUsers);
router.get('/:id',  getUserById);
router.post('/',    createUser);
router.patch('/:id',         updateUser);
router.get('/:id/license',   getLicense);
router.patch('/:id/license', upload.single('license'), updateLicense);

module.exports = router;
