const router = require('express').Router();
const { getUsers, getUserById, createUser, updateUser, getLicense, updateLicense } = require('../controllers/usersController');
const upload = require('../middleware/upload');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/',     requireAuth, requireRole('admin'), getUsers);          // full user list — admin only
router.get('/:id',  requireAuth, getUserById);                            // any authenticated (doctor lookup)
router.post('/',    requireAuth, requireRole('admin'), createUser);        // manual user creation — admin only
router.patch('/:id', requireAuth, updateUser);                            // self profile, or admin (role/status/doctorId)
router.get('/:id/license',   requireAuth, requireRole('admin', 'clinician'), getLicense);
// License replace stays open: pending/rejected clinicians have no token (cannot log in) yet
// must be able to upload a new license. The controller restricts it to pending/rejected clinicians.
router.patch('/:id/license', upload.single('license'), updateLicense);

module.exports = router;
