var gdal = require("gdal");

var dataset = gdal.open("./../data/elevation/srtm_42_05.tif");
const pixels = dataset.bands.get(1).pixels;
console.log(pixels.get(38, 28));
