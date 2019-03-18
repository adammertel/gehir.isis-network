var turf = require("turf");
var fs = require("fs");

const parse = require("csv-parse/lib/sync");
const folderPath = "./../data/pois/";

var round = require("./base").round;
var saveFile = require("./base").saveFile;

const artefactsCsv = parse(fs.readFileSync(folderPath + "artefacts.csv"), {
  from: 2
});
artefactPoints = artefactsCsv.map(artefact => {
  return turf.point([round(artefact[0]), round(artefact[1])], {
    id: artefact[2],
    name: artefact[3],
    BCE1: artefact[4].includes("1 BCE"),
    BCE2: artefact[4].includes("2 BCE"),
    BCE3: artefact[4].includes("3 BCE")
  });
});

const templesCsv = parse(fs.readFileSync(folderPath + "temples.csv"), {
  from: 2
});
templePoints = templesCsv.map(temple => {
  return turf.point([round(temple[0]), round(temple[1])], {
    id: temple[2],
    name: temple[3],
    BCE1: temple[4].includes("1 BCE"),
    BCE2: temple[4].includes("2 BCE"),
    BCE3: temple[4].includes("3 BCE"),
    CE1: temple[4].includes("1 CE"),
    CE2: temple[4].includes("2 CE"),
    CE3: temple[4].includes("3 CE")
  });
});

const politicsCsv = parse(fs.readFileSync(folderPath + "politics.csv"), {
  from: 2
});
politicPoints = politicsCsv.map(politic => {
  return turf.point([round(politic[0]), round(politic[1])], {
    name: politic[2],
    control: politic[4],
    type: politic[5],
    date: politic[6],
    military: politic[7] === "Yes"
  });
});

saveFile("artefacts", artefactPoints);
saveFile("temples", templePoints);
saveFile("politics", politicPoints);
