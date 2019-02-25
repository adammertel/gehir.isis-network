var turf = require("turf");
var fs = require("fs");
var lintersect = require("@turf/line-intersect");
var lSplit = require("@turf/line-split");
var lSegment = require("@turf/line-segment");
var equal = require("@turf/boolean-equal");
var clean = require("@turf/clean-coords").default;
var length = require("@turf/length").default;

var path = "./../data/";

let lastTime = new Date().valueOf();
const report = text => {
  const now = new Date().valueOf();
  console.log(text, "in", (now - lastTime) / 1000, "s");
  lastTime = new Date().valueOf();
};

// reading file
const readJSON = fileName =>
  JSON.parse(fs.readFileSync(path + fileName + ".geojson", "utf8"));

const roads = readJSON("original/roads");
const routes = readJSON("original/routes");

const ports = readJSON("original/ports");
const settlements = readJSON("original/settlements");
report("files read");

const edges = [].concat(...[roads.features, routes.features]);

const edgeFeatures = [];
edges.forEach(feat => {
  feat.geometry.coordinates.forEach(coord => {
    edgeFeatures.push(turf.lineString(coord, feat.properties));
  });
});

const segments = [];
edgeFeatures.forEach(f => {
  lSegment.default(f).features.forEach(s => segments.push(s));
});
report("routes segmentated");

const equalPoints = (p1, p2) => {
  const cs1 = p1.geometry.coordinates;
  const cs2 = p2.geometry.coordinates;
  return equalCoordinates(cs1, cs2);
};

const equalCoordinates = (cs1, cs2) => {
  return cs1[0] === cs2[0] && cs1[1] === cs2[1];
};

const intersectingPoint = (e1, e2) => {
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

  return ps2.find(p2 => {
    return ps1.find(p1 => equalCoordinates(p1, p2));
  });
};

const firstAndLastVertex = e => {
  return [e[0], e[e.length - 1]];
};

// takes two line features and return one joined
const joinLines = (l1, l2) => {
  const coords = [];

  const cs1 = l1.geometry.coordinates;
  const cs2 = l2.geometry.coordinates;

  let revertFirst = false;
  let revertSecond = false;

  firstAndLastVertex(cs1).forEach((c1, ci1) => {
    firstAndLastVertex(cs2).forEach((c2, ci2) => {
      if (equalCoordinates(c1, c2)) {
        if (ci1 === 0) {
          revertFirst = true;
        }
        if (ci2 === 1) {
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
report("lines joined");

//console.log(JSON.stringify(roadFeatures));

const intersections = [];
segments.forEach((rf1, rf1i) => {
  segments.forEach((rf2, rf12) => {
    if (rf1i !== rf12) {
      const intersection = lintersect.default(rf1, rf2);
      if (intersection.features.length) {
        intersection.features.map(f => {
          // duplicates
          if (
            !intersections.some(i => equalPoints(i, f)) &&
            !settlements.features.some(s => equalPoints(s, f))
          ) {
            intersections.push(f);
          }
        });
      }
    }
  });
});
report("intersections detected");

/* crossroads */
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
report("crossroads identified");

/* dead ends */
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
report("deadends identified");

// join settlements, ports, crossroads and dead ends
const nodes = [];
const addNode = (f, type) => {
  nodes.push(
    turf.point(f.geometry.coordinates, {
      ...f.properties,
      ...{ type: type, id: nodes.length }
    })
  );
};

ports.features.forEach(f => addNode(f, "port"));
settlements.features.forEach(f => addNode(f, "settlement"));
crossroads.forEach(f => addNode(f, "crossroad"));
deadEnds.forEach(f => addNode(f, "deadend"));
report("nodes merged");

// finds intersections not in points
const intersectingPlaces = intersections.filter(i => {
  return !nodes.some(n => equalPoints(n, i));
});
report("looking for intersecting places");

const joinedSegments = [];
intersectingPlaces.forEach(intersection => {
  // find intersecting segments
  const edges = segments.filter(s =>
    s.geometry.coordinates.find(c =>
      equalCoordinates(c, intersection.geometry.coordinates)
    )
  );
  if (edges.length === 2) {
    edges[0].geometry = joinLines(edges[0], edges[1]).geometry;
    edges[1].geometry.coordinates = [[]];
  }
});
report("segments recalculated");

/*
// join route and road segments based on nodes
segments.forEach((rf1, rf1i) => {
  segments.forEach((rf2, rf2i) => {
    if (
      rf1i !== rf2i &&
      rf1.geometry.coordinates.length &&
      rf2.geometry.coordinates.length
    ) {
      // TODO: own algorithm
      const intersection = intersectingPoint(rf1, rf2);

      // if there is an intersection
      if (intersection) {
        // if the intersection is not equal to any node
        if (
          !nodes.some(n =>
            equalCoordinates(n.geometry.coordinates, intersection)
          )
        ) {
          rf1.geometry = joinLines(rf1, rf2).geometry;
          rf2.geometry.coordinates = [[]];
        }
      }
    }
  });
});
*/

// get valid segments
const segmentsFiltered = segments
  .filter(s => s.geometry.coordinates[0].length > 1)
  .map((s, si) => {
    return {
      type: s.type,
      geometry: s.geometry,
      properties: { ...s.properties, ...{ id: si } }
    };
  });

// add node ids for segments
segmentsFiltered.forEach(s => {
  const coords = s.geometry.coordinates;
  const fromC = coords[0];
  const toC = coords[coords.length - 1];

  const fromNode = nodes.find(node => equalPoints(node, turf.point(fromC)));
  const toNode = nodes.find(node => equalPoints(node, turf.point(toC)));

  //console.log(fromNode);
  //console.log(toNode);

  if (fromNode) {
    s.properties.from = fromNode.properties.id;
  }
  if (toNode) {
    s.properties.to = toNode.properties.id;
  } else {
    //console.log("no to node", s.properties);
  }

  s.properties.length = length(s).toFixed(3);
});
report("segments validated");

const saveFile = (name, data) => {
  fs.writeFileSync(
    path + name + ".geojson",
    JSON.stringify(turf.featureCollection(data))
  );
};

// saving files
saveFile("nodes", nodes);
saveFile("edges", segmentsFiltered);

report("files saved");
