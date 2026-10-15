const TRAIL_IMAGES = {
  'Mt. Apo': require('../assets/trails/mount-apo.jpeg'),
  'Mt. Babag': require('../assets/trails/babag.jpeg'),
  'Mt. Balagbag': require('../assets/trails/mount-balagbag.jpeg'),
  'Mt. Batolusong': require('../assets/trails/mount-batolusong.jpeg'),
  'Mt. Batulao': require('../assets/trails/mount-batulao.jpeg'),
  'Casino Peak (Lugsangan Peak)': require('../assets/trails/casino-peak.jpeg'),
  'Mt. Daguldol': require('../assets/trails/mount-daguldol.jpeg'),
  'Mt. Daraitan': require('../assets/trails/mount-daraitan.jpeg'),
  'Mt. Dulang-Dulang': require('../assets/trails/mount-dulang-dulang.jpeg'),
  'Mt. Guiting-Guiting': require('../assets/trails/mount-guiting-guiting.jpeg'),
  'Mt. Hibok-Hibok': require('../assets/trails/mount-hibok-hibok.jpeg'),
  'Mt. Kalatungan': require('../assets/trails/mount-kalatungan.jpeg'),
  'Mt. Kanlaon': require('../assets/trails/mount-kanlaon.jpeg'),
  'Mt. Kitanglad': require('../assets/trails/mount-kitanglad.jpeg'),
  'Mt. Maculot': require('../assets/trails/mount-maculot.jpeg'),
  'Mt. Manunggal': require('../assets/trails/mount-manunggal.jpeg'),
  'Masungi Georeserve': require('../assets/trails/mount-masungi.jpeg'),
  'Mayon Volcano': require('../assets/trails/mount-mayon.jpeg'),
  'Mt. Pico de Loro': require('../assets/trails/mount-pico-de-loro.jpeg'),
  'Mt. Pinatubo Crater': require('../assets/trails/mount-pinatubo.jpeg'),
  'Mt. Pulag': require('../assets/trails/mount-pulag.jpeg'),
  'Sirao Peak (Mt. Kan-irag)': require('../assets/trails/sirao-peak.jpeg'),
  'Spartan Trail': require('../assets/trails/spartan-trail.jpeg'),
  'Starbuk’s Trail': require('../assets/trails/starbuks-trail.jpeg'),
  'Mt. Talamitam': require('../assets/trails/mount-talamitam.jpeg'),
  'Mt. Ulap': require('../assets/trails/mount-ulap.jpeg'),
};

export const DEFAULT_TRAIL_IMAGE = require('../assets/trails/default-trail.jpeg');

export function getTrailImages(trail) {
  const name = trail?.name?.trim();

  return [TRAIL_IMAGES[name] || DEFAULT_TRAIL_IMAGE];
}