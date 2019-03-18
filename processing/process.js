var turf = require("turf");
var jsnx = require("jsnetworkx");
var tobler = require("./tobler").tobler;

var report = require("./base").report;
var round = require("./base").round;
var readJSON = require("./base").readJSON;
var saveFile = require("./base").saveFile;
var equalPoints = require("./base").equalPoints;
var equalCoordinates = require("./base").equalCoordinates;
var intersectingPoint = require("./base").intersectingPoint;
var firstAndLastVertex = require("./base").firstAndLastVertex;

var lintersect = require("@turf/line-intersect");
var lSplit = require("@turf/line-split");
var lChunk = require("@turf/line-chunk");
var lSegment = require("@turf/line-segment");
var equal = require("@turf/boolean-equal");
var clean = require("@turf/clean-coords").default;
var length = require("@turf/length").default;

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

const segmentFromNode = segment => {
  const coords = segment.geometry.coordinates;
  const fromC = coords[0];
  return nodes.find(node => equalPoints(node, turf.point(fromC)));
};

const segmentToNode = segment => {
  const coords = segment.geometry.coordinates;
  const fromC = coords[coords.length - 1];
  return nodes.find(node => equalPoints(node, turf.point(fromC)));
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
            !settlements.features.some(s => equalPoints(s, f)) &&
            !ports.features.some(p => equalPoints(p, f))
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
      return equalCoordinates(c, i.geometry.coordinates);
      // equal.default(c, i.geometry.coordinates)
    });
  });

  if (crosses.find(c => c.properties.type === "maritime")) {
    i.properties.maritime = true;
  }

  return crosses.length > 2;
});
report("crossroads identified");

/* dead ends */
const deadEnds = [];
segments.forEach((s1, si1) => {
  s1.geometry.coordinates
    .filter(c => {
      return (
        !settlements.features.some(s =>
          equalCoordinates(s.geometry.coordinates, c)
        ) &&
        !ports.features.some(p => equalCoordinates(p.geometry.coordinates, c))
      );
    })
    .forEach(c => {
      const crosses = segments
        .filter((s2, si2) => si1 !== si2)
        .find(s2 => {
          const c2 = s2.geometry.coordinates;
          return equalCoordinates(c, c2[0]) || equalCoordinates(c, c2[1]);
        });
      if (!crosses) {
        deadEnds.push(turf.point(c));
      }
    });
});
report("deadends identified");

// join settlements, ports, crossroads and dead ends
const nodes = [];
const addNode = (f, source) => {
  nodes.push(
    turf.point(f.geometry.coordinates, {
      ...f.properties,
      source,
      ...{
        port: source === "port",
        settlement: source === "settlement",
        id: nodes.length
      }
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
// length of each chunk in the segment - for calculating the tobler index
const chunkLength = 0.05;
segmentsFiltered.forEach(segment => {
  const fromNode = segmentFromNode(segment);
  const toNode = segmentToNode(segment);

  if (fromNode) {
    segment.properties.from = fromNode.properties.id;
  }
  if (toNode) {
    segment.properties.to = toNode.properties.id;
  }

  // calculate distance
  let coeffSumThere = 0;
  let coeffSumBack = 0;
  const segmentLength = length(segment);

  const speedMaritime = 140;
  const speedRoad = 30;

  const speedCategory =
    segment.properties.type === "road" ? speedRoad : speedMaritime;

  let speedThere = speedCategory;
  let speedBack = speedCategory;

  // calculating speed for road based on the tobler coefficient
  if (segment.properties.type === "road") {
    const chunks = lChunk(segment, chunkLength).features;

    chunks.forEach(chunk => {
      const ps = firstAndLastVertex(chunk.geometry.coordinates);
      const dist = turf.distance(...ps);

      const coeffThere = tobler(...ps);
      const coeffBack = tobler(...ps.reverse());
      coeffSumThere = coeffSumThere + dist * coeffThere;
      coeffSumBack = coeffSumBack + dist * coeffBack;
    });

    const speedCoeffThere = coeffSumThere / segmentLength;
    const speedCoeffBack = coeffSumBack / segmentLength;
    speedThere = speedCategory * speedCoeffThere;
    speedBack = speedCategory * speedCoeffBack;
  }

  const timeThere = segmentLength / speedThere;
  const timeBack = segmentLength / speedBack;

  segment.properties.length = segmentLength;

  segment.properties.timeThere = round(timeThere);
  segment.properties.timeBack = round(timeBack);
});

const segmentsValidated = segmentsFiltered.filter(
  s => "to" in s.properties && "from" in s.properties
);

const segmentsToBeJoined = segmentsFiltered.filter(
  s => !("to" in s.properties || "from" in s.properties)
);

segmentsToBeJoined.forEach((s1, si1) => {
  segmentsToBeJoined.forEach((s2, si2) => {
    if (
      si1 !== si2 &&
      s1.geometry.coordinates.length &&
      s2.geometry.coordinates.length
    ) {
      const intersection = intersectingPoint(s1, s1);
      if (intersection) {
        // if the intersection is not equal to any node
        if (
          !nodes.some(n =>
            equalCoordinates(n.geometry.coordinates, intersection)
          )
        ) {
          s1.geometry = joinLines(s1, s2).geometry;
          s2.geometry.coordinates = [[]];
        }
      }
    }
  });
});
segmentsToBeJoined
  .filter(s => s.geometry.coordinates[0].length)
  .forEach(s => segmentsValidated.push(s));

report("segments validated");

segmentsValidated
  .filter(s => s.properties.type === "maritime")
  .forEach(segment => {
    const fromNode = segmentFromNode(segment);
    const toNode = segmentToNode(segment);

    if (
      fromNode &&
      (fromNode.properties.source === "port" ||
        fromNode.properties.source === "settlement")
    ) {
      fromNode.properties.port = true;
    }

    if (
      toNode &&
      (toNode.properties.source === "port" ||
        toNode.properties.source === "settlement")
    ) {
      toNode.properties.port = true;
    }
  });

report("identifying ports");

var G = new jsnx.DiGraph();

segmentsValidated.forEach(segment => {
  G.addEdge(segment.properties.from, segment.properties.to, {
    time: segment.properties.timeThere
  });
  G.addEdge(segment.properties.to, segment.properties.from, {
    time: segment.properties.timeBack
  });
});

const alexandriaId = nodes.find(node => node.properties.title === "Alexandria")
  .properties.id;

//const paths = jsnx.shortestPath(G, { source: alexandriaId, weight: "weight" });
// console.log(G.edges());
const paths = jsnx.allPairsDijkstraPath(G, { weight: "time" });

//console.log(paths.get(40).get(alexandriaId));
report("graph created");

const visits = {};
nodes
  .filter(n => n.properties.port || n.properties.settlement)
  //.filter(n => n.properties.id === 43)
  .forEach(node => {
    const nodeId = node.properties.id;
    const path = paths.get(nodeId).get(alexandriaId);
    path.forEach(node => {
      if (node in visits) {
        visits[node].push(nodeId);
      } else {
        visits[node] = [nodeId];
      }
    });
  });
report("visits calculated");

const bCentralities = jsnx.betweennessCentrality(G, { normalized: true });
const eCentralities = jsnx.eigenvectorCentrality(G, {
  maxIter: 99999
});

nodes.map(node => {
  const bcentrality = bCentralities["_numberValues"][node.properties.id];
  const ecentrality = eCentralities["_numberValues"][node.properties.id];

  node.properties.bcentrality = bcentrality ? round(bcentrality) : 0;
  node.properties.ecentrality = ecentrality ? round(ecentrality) : 0;

  // in case of port - check if there is a close maritime node
  const closeNodeDistance = 10;

  const nodeVisits = visits[node.properties.id] || [];
  if (node.properties.port) {
    const nodeDistances = nodes
      .filter(n => n.properties.id !== node.properties.id)
      .filter(n => n.properties.source === "crossroad")
      .filter(n => n.properties.maritime)
      .map(nodeToSearch => {
        const distanceToNode = turf.distance(nodeToSearch, node);
        return {
          id: nodeToSearch.properties.id,
          distance: distanceToNode
        };
      });
    nodeDistances.sort((n1, n2) => (n1.distance < n2.distance ? -1 : 1));

    const closestDistance = nodeDistances[0];

    if (closestDistance.distance < closeNodeDistance) {
      // there is a close connected crossroad
      const allVisits = nodeVisits.concat(visits[closestDistance.id]);
      node.properties.visits = allVisits.filter(
        (el, i, a) => i === a.indexOf(el)
      );
    } else {
      node.properties.visits = nodeVisits;
    }
  } else {
    node.properties.visits = nodeVisits;
  }
});
report("centralities calculated");

/*
  saving files
*/
saveFile("nodes", nodes);
saveFile("edges", segmentsValidated);
report("files saved");
