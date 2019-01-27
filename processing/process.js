var turf = require("turf");
var fs = require("fs");
var lintersect = require("@turf/line-intersect");
var lSplit = require("@turf/line-split");
var lSegment = require("@turf/line-segment");
var equal = require("@turf/boolean-equal");

var path = "./../data/";
// reading file
const readJSON = fileName =>
  JSON.parse(fs.readFileSync(path + fileName + ".geojson", "utf8"));

const roads = readJSON("original/roads");
const routes = readJSON("original/routes");

const ports = readJSON("original/ports");
const settlements = readJSON("original/settlements");

const edges = [].concat(...[roads.features, routes.features]);

const roadFeatures = [];
edges.forEach(feat => {
  feat.geometry.coordinates.forEach(coord => {
    roadFeatures.push(turf.lineString(coord));
  });
});

const segments = [];
roadFeatures.forEach(f => {
  lSegment.default(f).features.forEach(s => segments.push(s));
});

const equalPoints = (p1, p2) => {
  const cs1 = p1.geometry.coordinates;
  const cs2 = p2.geometry.coordinates;
  return cs1[0] === cs2[0] && cs1[1] === cs2[1];
};

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

// join settlements, ports, crossroads and dead ends
const nodes = [];

ports.features.forEach(f => {
  f.properties.type = "port";
  nodes.push(turf.point(f.geometry.coordinates, f.properties));
});
settlements.features.forEach(f => {
  f.properties.type = "settlement";
  nodes.push(turf.point(f.geometry.coordinates, f.properties));
});
crossroads.forEach(f => {
  f.properties.type = "crossroad";
  if (!nodes.some(n => equalPoints(n, f))) {
    nodes.push(turf.point(f.geometry.coordinates, f.properties));
  }
});
deadEnds.forEach(f => {
  f.properties.type = "deadend";
  if (!nodes.some(n => equalPoints(n, f))) {
    nodes.push(turf.point(f.geometry.coordinates, f.properties));
  }
});

// join route and road segments based on nodes

//

const saveFile = (name, data) => {
  fs.writeFileSync(
    path + name + ".geojson",
    JSON.stringify(turf.featureCollection(data))
  );
};

// saving files
saveFile("nodes", nodes);
saveFile("edges", edges);
