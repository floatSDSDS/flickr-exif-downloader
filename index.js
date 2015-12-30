/**
 * Created by harkous on 30/12/15.
 */
var exifDown = require('./flickr-exif-downloader');
module.exports = {
    addExif: exifDown.addExif,
    downloadWithExif: exifDown.downloadWithExif
};