const puppeteer = require('puppeteer')
const fs = require('fs')
const moment = require("moment")
const find = require('find')

const TMP_PATH = "./tmp"

if (!fs.existsSync(TMP_PATH)){
  fs.mkdirSync(TMP_PATH)
}


////
/// Make sure to call
///
/// await page._client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: TMP_PATH});
////
function getFileNameFromHeader(dispo) {
  var temp = dispo
  var idx = temp.indexOf("filename=")
  if (idx < 0) {
    return ""
  }
  temp = temp.substr(idx + 10, temp.length - idx - 10)
  idx = temp.indexOf(`"`)
  if (idx < 0) {
    return ""
  }
  temp = temp.substr(0, idx) 
  return temp
}


async function waitForFiledownload(timeout) {
  const waitObj = {
    status:null,
    destPath:null,
    timestamp:moment()
  }
  const downFolder = TMP_PATH

  const client = await this.page.target().createCDPSession();
  await client.send('Network.enable');

  let waitInterval = null

  const findFileDownloaded = (fileName) => {
    var idx = fileName.lastIndexOf(".")
    if (idx > 0) {
      fileName = fileName.substr(0, idx)
    }
    return new Promise((resolve, reject) => {
      var cont = true
      find.file(new RegExp(`${fileName}.*`), downFolder , function(files) {
        if (!cont) {
          return
        }
        for (const file of files) {
          const stats = fs.statSync(file)
          if (stats.isFile()) {
            const mTime = moment(stats["mtime"])
            if (mTime.isAfter(waitObj.timestamp)) {
              resolve(file)
              cont = false
              return
            }
          }
        }
        resolve(false)
      })
    })
  }

  const doResolve = async (resolve, destPath) => {
    waitObj.status = "ok"
    waitObj.destPath = destPath
    if (waitInterval) {
      clearInterval(waitInterval)
      waitInterval = null
    }
    resolve(waitObj)
  }

  console.log(`waitForFileDownload ${timeout}`)
  return new Promise(async (resolve, reject) => {
    setTimeout(async function () {
      if (waitInterval) {
        clearInterval(waitInterval)
        waitInterval = null
      }
      waitObj.status = "error_timeout"
      await client.send('Network.disable');
      reject(waitObj)
    }, timeout)  

    client.on('Network.responseReceived', async (param) => {
      const respHeaders = param.response.headers
      if (respHeaders && respHeaders["Content-Disposition"]) {
        const fileName = getFileNameFromHeader(respHeaders["Content-Disposition"])
        console.log(`responseReceived ${fileName} `)
        if (!waitInterval) {
          waitInterval = setInterval(async function() {
            // check file exist
            const exist = await findFileDownloaded(fileName, waitObj.timestamp)
            if (exist) {
              await client.send('Network.disable');
              doResolve(resolve, exist)
            }
          }, 500)
        }
      }
    })
  })
}
