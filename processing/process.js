var turf = require("turf");
var fs = require("fs");
var lintersect = require("@turf/line-intersect");
var lSplit = require("@turf/line-split");
var lSegment = require("@turf/line-segment");
var equal = require("@turf/boolean-equal");
var clean = require("@turf/clean-coords").default;

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

// takes two line features and return one joined
const joinLines = (l1, l2) => {
  const coords = [];

  const cs1 = l1.geometry.coordinates;
  const cs2 = l2.geometry.coordinates;
  let revertFirst = false;
  let revertSecond = false;
  cs1.forEach((c1, ci1) => {
    cs2.forEach((c2, ci2) => {
      if (c1[0] === c2[0] && c1[1] === c2[1]) {
        if (ci1 === 0) {
          revertFirst = true;
        }
        if (ci2 === l2.geometry.coordinates.length - 1) {
          revertSecond = true;
        }
      }
    });
  });

  if (revertFirst) {
    cs1.reverse();
  }
  if (revertSecond) {
    cs2.reverse();
  }

  cs1.forEach(c1 => coords.push(c1));
  cs2.filter((c, ci) => ci !== 0).forEach(c2 => coords.push(c2));
  return turf.lineString(coords);
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
segments.forEach((rf1, rf1i) => {
  segments.forEach((rf2, rf2i) => {
    if (rf1i !== rf2i) {
      const intersection = lintersect.default(rf1, rf2);

      // if there is an intersection
      if (intersection.features.length) {
        const intersect = intersection.features[0];

        // if the intersection is not node
        if (!nodes.some(n => equalPoints(n, intersect))) {
          rf1.geometry = joinLines(rf1, rf2).geometry;
          rf2.geometry.coordinates = [[]];
        }
      }
    }
  });
});

const segmentsFiltered = segments
  .filter(s => s.geometry.coordinates[0].length > 1)
  .map(s => {
    return {
      type: s.type,
      geometry: s.geometry,
      properties: s.properties
    };
  });

const saveFile = (name, data) => {
  fs.writeFileSync(
    path + name + ".geojson",
    JSON.stringify(turf.featureCollection(data))
  );
};

// saving files
saveFile("nodes", nodes);
saveFile("edges", segmentsFiltered);
