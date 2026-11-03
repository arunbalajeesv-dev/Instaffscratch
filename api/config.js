// Hands the browser the Google Maps key from an environment variable, so it is not stored in git.
// The key is still visible to anyone who opens the page, as it must be; protect it with the
// website and API restrictions on the key in Google Cloud.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({mapsKey: process.env.GOOGLE_MAPS_KEY || ''});
};
