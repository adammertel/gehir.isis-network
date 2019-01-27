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

const routes = JSON.parse(
  fs.readFileSync(path + "original/routes.geojson", "utf8")
);

const edges = turf.featureCollection(
  [].concat(...[roads.features, routes.features])
);

const roadFeatures = [];
edges.features.forEach(feat => {
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

// dead ends
const deadEnds = [];
segments.forEach((s1, si1) => {
  s1.geometry.coordinates.forEach(c => {
    const crosses = segments
      .filter((s2, si2) => si1 !== si2)
      .filter(s2 => {
        const c2 = s2.geometry.coordinates;
        return (
          (c[0] === c2[0][0] && c[1] === c2[0][1]) ||
          (c[0] === c2[1][0] && c[1] === c2[1][1])
        );
      });
    if (!crosses.length) {
      deadEnds.push(turf.point(c));
    }
  });
});

const collIntersections = turf.featureCollection(crossroads);
const collDeadEnds = turf.featureCollection(deadEnds);

// join crossroads and original nodes (settlements, ports)

// join route and road segments based on nodes

//

const saveFile = (name, data) => {
  fs.writeFileSync(path + name + ".geojson", JSON.stringify(data));
};

// saving files
saveFile("deadends", collDeadEnds);
saveFile("intersections", collIntersections);
saveFile("edges", edges);
