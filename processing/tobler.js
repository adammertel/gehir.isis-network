var gdal = require("gdal");
var turf = require("turf");

var dataset = gdal.open("./../data/elevation/srtm_42_05.tif");
const band = dataset.bands.get(1);
const pixels = band.pixels;

const gt = dataset.geoTransform;

module.exports.value = (x, y) => {
  const px = parseInt((x - gt[0]) / gt[1], 10);
  const py = parseInt((y - gt[3]) / gt[5], 10);
  return pixels.get(px, py);
};

// calculates the tobler coefficient for the given distance and height difference
module.exports.toblerCoeff = (distance, diff) => {
  return Math.pow(Math.E, -3.5 * Math.abs(diff / distance + 0.05));
};

// takes two points and returns calculated tobler coefficient
module.exports.tobler = (p1, p2) => {
  const h1 = value(p1[0], p1[1]);
  const h2 = value(p2[0], p2[1]);

  const diff = h1 - h2;
  const dist = turf.distance(p1, p2) * 1000;

  console.log("h1", h1);
  console.log("h2", h2);
  console.log("diff", diff);
  console.log("dist", dist);

  return toblerCoeff(dist, diff);
};
