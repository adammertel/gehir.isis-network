var turf = require("turf");
var fs = require("fs");
var lintersect = require("@turf/line-intersect");
var lSplit = require("@turf/line-split");
var lSegment = require("@turf/line-segment");
var equal = require("@turf/boolean-equal");

var path = "./../data/";
// reading file
const roads = JSON.parse(
  fs.readFileSync(path + "original/roads.geojson", "utf8")
);

const roadFeatures = [];
roads.features.forEach(feat => {
  feat.geometry.coordinates.forEach(coord => {
    roadFeatures.push(turf.lineString(coord));
  });
});

const segments = [];
roadFeatures.forEach(f => {
  lSegment.default(f).features.forEach(s => segments.push(s));
});

//console.log(JSON.stringify(roadFeatures));

const intersections = [];
segments.forEach((rf1, rf1i) => {
  segments.forEach((rf2, rf12) => {
    if (rf1i !== rf12) {
      const intersection = lintersect.default(rf1, rf2);
      if (intersection.features.length) {
        intersection.features.map(f => {
          // duplicates
          if (!intersections.some(i => equal.default(i, f))) {
            intersections.push(f);
          }
        });
      }
    }
  });
});

// crossroads
const crossroads = intersections.filter(i => {
  const crosses = segments.filter(segment => {
    return segment.geometry.coordinates.find(c => {
      return (
        c[0] === i.geometry.coordinates[0] && c[1] === i.geometry.coordinates[1]
      );
      // equal.default(c, i.geometry.coordinates)
    });
  });

  return crosses.length > 2;
});

const collection = turf.featureCollection(crossroads);
//const collection = turf.featureCollection(segments);

// saving file
fs.writeFileSync(
  path + "roads_intersection.geojson",
  JSON.stringify(collection)
);
