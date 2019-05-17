var gdal = require("gdal");
var turf = require("turf");
var fs = require("fs");
var Json2csvParser = require("json2csv").Parser;

let lastTime = new Date().valueOf();
module.exports.report = text => {
  const now = new Date().valueOf();
  console.log("task '" + text + "' finished in", (now - lastTime) / 1000, "s");
  lastTime = new Date().valueOf();
};

const defaultRoundingPoint = 4;
module.exports.round = round = (
  numberToRound,
  floatingPoint = defaultRoundingPoint
) => {
  return parseFloat(parseFloat(numberToRound).toFixed(floatingPoint));
};

const path = "./data/";
module.exports.readJSON = fileName => {
  const dataset = JSON.parse(
    fs.readFileSync(path + fileName + ".geojson", "utf8")
  );
  const fixedFeatures = dataset.features
    .filter(f => f.geometry)
    .map(f => {
      const coordinates = f.geometry.coordinates.map(coords => {
        if (!isNaN(coords)) {
          return round(coords, 4);
        } else {
          return coords.map(cs => cs.map(c => round(c, 4)));
        }
      });
      f.geometry.coordinates = coordinates;
      return f;
    });

  dataset.features = fixedFeatures;

  return dataset;
};

module.exports.saveJSON = (name, data) => {
  fs.writeFileSync(
    path + name + ".geojson",
    JSON.stringify(turf.featureCollection(data))
  );
};

module.exports.saveCSV = (name, data) => {
  const csvRows = data.map(d => d.properties);
  const csvFields = Object.keys(csvRows[0]);
  const json2csvParser = new Json2csvParser({ csvFields });
  const csv = json2csvParser.parse(csvRows);

  fs.writeFileSync(path + name + ".csv", csv);
};

module.exports.equalPoints = equalPoints = (p1, p2) => {
  const cs1 = p1.geometry.coordinates;
  const cs2 = p2.geometry.coordinates;
  return equalCoordinates(cs1, cs2);
};

module.exports.equalCoordinates = equalCoordinates = (cs1, cs2) => {
  return cs1[0] === cs2[0] && cs1[1] === cs2[1];
};

module.exports.intersectingPoint = intersectingPoint = (e1, e2) => {
  const ps1 = firstAndLastVertex(e1.geometry.coordinates);
  const ps2 = firstAndLastVertex(e2.geometry.coordinates);

  if (equalCoordinates(ps1[0], ps2[0]) || equalCoordinates(ps1[0], ps2[1])) {
    return ps1[0];
  } else if (
    equalCoordinates(ps1[1], ps2[0]) ||
    equalCoordinates(ps1[1], ps2[1])
  ) {
    return ps1[1];
  } else {
    return false;
  }
};

module.exports.firstAndLastVertex = firstAndLastVertex = e => {
  return [e[0], e[e.length - 1]];
};
