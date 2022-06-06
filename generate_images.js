//////////////////////////////////////////////////////////////
// IMPORTS
//////////////////////////////////////////////////////////////
const WomboDreamApi = require('wombo-dream-api'); // api for generation
const Path = require('path'); // saving to local file system 
var Jimp = require('jimp'); // downloading images + manipulation
const csv = require('csv-parser')
const fs = require('fs');
const { Console } = require('console');

//////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////
// TODO: replace phrase/style/count with a csv file parsing system
// 'Love' => 24,
// 'Ghibli' => 22,
// 'Death' => 25,
// 'Surreal' => 23,
// 'Robots' => 26,
// 'No Style' => 3,
// 'Dark Fantasy' => 10,
// 'Mystical' => 11,
// 'Baroque' => 13,
// 'Etching' => 14,
// 'S.Dali' => 15,
// 'Wuhtercuhler' => 16,
// 'Provenance' => 17,
// 'Moonwalker' => 19,
// 'Blacklight' => 20,
// 'Rose Gold' => 18,
// 'Steampunk' => 4,
// 'Fantasy Art' => 5,
// 'Vibrant' => 6,
// 'HD' => 7,
// 'Psychic' => 9,
// 'Psychedelic' => 21,
// 'Synthwave' => 1,
// 'Ukiyoe' => 2
let minDelayBetweenGenerations = 2500; // avoid throttling
let maxDelayBetweenGenerations = 5000;
let minDelayBetweenRequests = 5000;
let maxDelayBetweenRequests = 10000;
const WOMBO_INSTANCE = WomboDreamApi.buildDefaultInstance();

//////////////////////////////////////////////////////////////
// UTILITY
//////////////////////////////////////////////////////////////
// Delay between function calls
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Download the image & store as 1080x1920 png
async function downloadImage(url, path) {
  // Download Image & Resize to 1080x1920
  await Jimp.read(url)
  .then(image => {
    // TODO: Add text on top? Jimp supports this 
    console.log("Saving " + path);
    return image.resize(1080, 1920).write(path);
  })
  .catch(err => {
    console.log("Oh god oh fuck couldn't mess wif da file at url: ", url, " cuz of " + err);
  });
}

// Random number between min,max inclusive
function randomNumberInRange(min, max) { 
    return Math.floor(Math.random() * (max - min)) + min;
} 

// Gathers all current styles from the Wombo site & stores as map
// from NAME -> ID (e.g., "Synthwave" -> 1)
// TODO: replace with parsing from a csv file that I occassionally update
async function getStyleToIDMap(){
  var localStyles;
  await WOMBO_INSTANCE
  .fetchStyles()
	.then((styles) => localStyles = styles)
	.catch(console.error);

  let localStyleToIDMap = new Map();

  for (let i = 0; i < localStyles.length ; i++){
    let id = localStyles[i]["id"];
    let name = localStyles[i]["name"];
    localStyleToIDMap.set(name, id);
  }

  return localStyleToIDMap;
}

// returns random key from Set or Map
function getRandomKey(collection) {
  let keys = Array.from(collection.keys());
  return keys[Math.floor(Math.random() * keys.length)];
}

//////////////////////////////////////////////////////////////
// GENERATION
//////////////////////////////////////////////////////////////
// Given the requested phrase, a number to generate, and a style,
// calls the Dream API to generate images.
async function generate(phrase, numRequested, style, csvPath){
    let i = 0;
    let styleToIDMap = await getStyleToIDMap();
    let totalNumStyles = styleToIDMap.length;
    console.log(styleToIDMap);
    for (i; i < numRequested; i++){
      const requestedIndex = i;
        console.log("Starting Generation " + i);
        let styleID = styleToIDMap.get(style);
          // Make directory for output if doesn't exist
        const path = Path.resolve(__dirname, csvPath.split(".")[0], phrase, style, requestedIndex + ".png");
        // WHAT IF I DOWNLOAD EVERY SINGLE STAGE????
        WOMBO_INSTANCE
        .generatePicture(phrase, styleID, (task) => {
            console.log(task.state, 'stage', task.photo_url_list.length);
        })
        .then((task) => downloadImage(task?.result.final, path))
        .catch(console.error);

        // Delay between calls
        await sleep(randomNumberInRange(minDelayBetweenGenerations, maxDelayBetweenGenerations));
    }
}

// Chooses a random style before calling the generate method
async function generateWithRandomStyle(phrase, numRequested, csvPath){
    let i = 0;
    for (i; i < numRequested; i++){
        let randomStyle = randomNumberInRange(1, totalNumStyles);
        await generate(phrase, 1, randomStyle, csvPath);
    }
}

async function generateWithStagesWithImage(phrase, numRequested, style, styleToIDMap, id_override, csvPath, imagePath){
  let i = 0;
  if (styleToIDMap == null){
    styleToIDMap = await getStyleToIDMap();
  }
  for (i; i < numRequested; i++){
    let timeToSleep = randomNumberInRange(minDelayBetweenGenerations, maxDelayBetweenGenerations);
    console.log("Sleeping " + timeToSleep + " milliseconds between generations.")
    await sleep(timeToSleep);
    let requestedIndex = id_override;
    if (id_override == null){
      requestedIndex = i;
    }
    console.log("Starting Generation " + i);
    let styleID = styleToIDMap.get(style);

    if (styleID == null){
      console.log("ayo bad style broski");
    }
    WOMBO_INSTANCE
    .uploadImage(fs.readFileSync(imagePath))
    .then((uploadedImageInfo) => {
      WOMBO_INSTANCE
      .generatePicture(
          phrase,
          styleID,
          (task) => {
            console.log(task.state, 'stage', task.photo_url_list.length);
          },
          {
            mediastore_id: uploadedImageInfo.id,
            weight: 'MEDIUM',
          }
        )
        .then((task) => {
          if (task?.photo_url_list.length > 0){
            for (let i = 0; i < task.photo_url_list.length; i++){
              const progressIndex = i;
              const path = Path.resolve(__dirname, csvPath.split(".")[0], phrase, imagePath.split(".")[0], style, requestedIndex + "_" + progressIndex + ".jpg");
              downloadImage(task.photo_url_list[progressIndex], path)
            }
            const finalPath = Path.resolve(__dirname, csvPath.split(".")[0], phrase, imagePath.split(".")[0], style, requestedIndex + "_final.jpg");
            downloadImage(task?.result.final, finalPath)
          }
        })
        .catch(console.error);
    })
    .catch(console.error);
  }
}

async function generateWithStages(phrase, numRequested, style, styleToIDMap, id_override, csvPath){
  let i = 0;
  if (styleToIDMap == null){
    styleToIDMap = await getStyleToIDMap();
  }
  for (i; i < numRequested; i++){
    let requestedIndex = id_override;
    if (id_override == null){
      requestedIndex = i;
    }
    console.log("Starting Generation " + i);
    let styleID = styleToIDMap.get(style);

    if (styleID == null){
      console.log("ayo bad style broski");
    }

    // WHAT IF I DOWNLOAD EVERY SINGLE STAGE????
    WOMBO_INSTANCE
    .generatePicture(phrase, styleID, (task) => {
        console.log(task.state, 'stage', task.photo_url_list.length);
    })
    .then((task) => {
      if (task?.photo_url_list.length > 0){
        for (let i = 0; i < task.photo_url_list.length; i++){
          const progressIndex = i;
          const path = Path.resolve(__dirname, csvPath.split(".")[0], phrase, style, requestedIndex + "_" + progressIndex + ".jpg");
          downloadImage(task.photo_url_list[progressIndex], path)
        }
        const finalPath = Path.resolve(__dirname, csvPath.split(".")[0], phrase, style, requestedIndex + "_final.jpg");
        downloadImage(task?.result.final, finalPath)
      }
    })
    .catch(console.error);

    // Delay between calls
    await sleep(randomNumberInRange(minDelayBetweenGenerations, maxDelayBetweenGenerations));
  }
}

// Chooses a random style before calling the generate method
async function generateRandomStyleWithStages(phrase, numRequested, csvPath){
  let i = 0;
  let styleToIDMap = await getStyleToIDMap();
  for (i; i < numRequested; i++){
    const id_override = i;
    let randomStyle = getRandomKey(styleToIDMap);
    await generateWithStages(phrase, 1, randomStyle, styleToIDMap, id_override, csvPath);
  }
}

async function generateInputFromCSV(csvPath){
  let results = []
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => {
      results.push(data)
    })
    .on('end', () => {
      console.log("Successfully loaded CSV.");
      console.log(results);
      for (let i = 0; i < results.length; i++){
        // generate(phraseToGenerate, numToGenerate, chosenStyle);
        // generateWithRandomStyle(phraseToGenerate, numToGenerate);
        let phraseToGenerate = results[i]["PHRASE"]; // prompt used for generation
        let chosenStyle = results[i]["STYLE"]; // style from the Wombo site
        let numToGenerate = results[i]["COUNT"]; // how many pictures do we want?
        if (chosenStyle == "Random"){
          generateRandomStyleWithStages(phraseToGenerate, numToGenerate, csvPath);
        } else {
          generateWithStages(phraseToGenerate, numToGenerate, chosenStyle, null, null, csvPath);
        }
      }
    });
  return results;
}

async function generateInputFromCSVWithImages(csvPath){
  let results = []
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => {
      results.push(data)
    })
    .on('end', async () => {
      console.log("Successfully loaded CSV.");
      console.log(results);
      for (let i = 0; i < results.length; i++){
        // Delay between calls
        let timeToSleep = randomNumberInRange(minDelayBetweenRequests, maxDelayBetweenRequests);
        console.log("Sleeping " + timeToSleep + " milliseconds between requests.")
        await sleep(timeToSleep);
        // generate(phraseToGenerate, numToGenerate, chosenStyle);
        // generateWithRandomStyle(phraseToGenerate, numToGenerate);
        let phraseToGenerate = results[i]["PHRASE"]; // prompt used for generation
        let chosenStyle = results[i]["STYLE"]; // style from the Wombo site
        let numToGenerate = results[i]["COUNT"]; // how many pictures do we want?
        let imagePath = results[i]["IMAGE"]; // the path to the image to use as a seed
        if (chosenStyle == "Random"){
          //generateRandomStyleWithStages(phraseToGenerate, numToGenerate, csvPath);
        } else {
          console.log("Starting Generation for phrase={" + phraseToGenerate + "}, style={" + chosenStyle + "}, count={" + numToGenerate + "}, imagePath={" + imagePath + "}")
          generateWithStagesWithImage(phraseToGenerate, numToGenerate, chosenStyle, null, null, csvPath, imagePath);
        }
      }
    });
  return results;
}

//////////////////////////////////////////////////////////////
// EXECUTION
//////////////////////////////////////////////////////////////
generateInputFromCSV("input.csv");
//generateInputFromCSVWithImages("image_input.csv");