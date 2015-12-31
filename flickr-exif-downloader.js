/**
 * Created by harkous on 30/12/15.
 */
var ex = require('exiv2');
var async = require('async');
var imageinfo = require('crafity-imageinfo');
var exifTags = require('./exifTags');
var path = require('path');
var request = require('request');
var fs = require('fs');
var gpsUtil = require('gps-util');
var _ = require('underscore')
/**
 * convert flickr gps format to decimal format
 * @param val
 * @returns {*}
 */
function convertToDecimal(val) {
    var regExp = new RegExp("(\\d+) deg ([0-9.]+)' ([0-9.]+)\"");
    var data = regExp.exec(val);
    if (!data) {
        console.log("NO MATCH " + val);
        return 0;
    }

    var deg = parseFloat(data[1]);
    var min = parseFloat(data[2]);
    var sec = parseFloat(data[3]);

    return deg + "/1 " + min + "/1 " + Math.floor(sec) + "/1";
}

/**
 * convert a decimal value
 * @param decimal
 * @returns {string}
 */
function convertDecimalToExivFormat(decimal) {
    var dd = gpsUtil.toDMS(decimal);

    var deg = dd.degrees;
    var min = dd.minutes;
    var sec = dd.seconds;

    return deg + "/1 " + min + "/1 " + Math.floor(sec) + "/1";
}
/**
 * input:
 * @param locationObj of format: {"latitude": "-33.933339","longitude": "151.177550",...}
 * @returns {string}
 */
function convertFlickrLocationtoExivFormat(location) {
    if (!location.latitude || (!location.longitude)) {
        return {};
    }
    latitude = convertDecimalToExivFormat(parseFloat(location.latitude));
    longitude = convertDecimalToExivFormat(parseFloat(location.longitude));
    latitudeRef = parseFloat(location.latitude) > 0 ? 'N' : 'S'
    longitudeRef = parseFloat(location.longitude) > 0 ? 'E' : 'W'
    return {
        latitude: latitude,
        longitude: longitude,
        latitudeRef: latitudeRef,
        longitudeRef: longitudeRef

    }
}


/**
 * convert the exif format from flickr's output format to exiv2 library input format
 * @param flickrExif
 * @param flickrLocation
 * @returns {{}}
 */
function convertExifFormat(flickrExif, flickrLocation) {

    var nodeExif = {};
    var exifArray = flickrExif.photo.exif;
    if (exifArray) {
        for (var i = 0; i < exifArray.length; i++) {
            var element = exifArray[i];
            var base = 'Exif.';
            switch (element.tagspace) {
                case "IFD0":
                    base += 'Image.';
                    break;
                case "ExifIFD":
                    base += 'Photo.';
                    break;
                case "GPS":
                    base += 'GPSInfo.';
                    break;
                default:
                    base = 'invalid'
            }

            var exifTag = base + element.tag;
            if (exifTags.indexOf(exifTag) > -1) {

                var val = element.raw._content;

                /*
                 there is a need to convert several fields from their raw values to what exiv2 understands
                 Here I converted the locations, but there is a need for others. The values that flickr returns are
                 actually the stringvalues while what we need are the code values. See 'ColorSpace' in this file for example:
                 https://github.com/olve/jpeg-react/blob/master/master/static/js/jpeg/app1.dictionary.js
                 */
                if (exifTag == "Exif.GPSInfo.GPSLatitudeRef") {
                    if (val == "North")
                        val = "N";
                    else if (val == "South")
                        val = "S";
                    else
                        continue;
                }
                else if (exifTag == "Exif.GPSInfo.GPSLongitudeRef") {
                    if (val == "East")
                        val = "E";
                    else if (val == "West")
                        val = "W";
                    else
                        continue;
                }
                else if (exifTag == "Exif.GPSInfo.GPSAltitudeRef") {
                    if (val == "Above Sea Level")
                        val = "0";
                    else
                        val = "1"
                }
                else if (exifTag == "Exif.GPSInfo.GPSLatitude") {
                    val = convertToDecimal(val);
                    if (!val) {
                        continue;
                    }
                }
                else if (exifTag == "Exif.GPSInfo.GPSLongitude") {
                    val = convertToDecimal(val);
                    if (!val) {
                        continue;
                    }
                }
                else if (exifTag == "Exif.GPSInfo.GPSAltitude") {
                    var regExp = new RegExp("(\\d+) m");
                    var data = regExp.exec(val);
                    if (!data) {
                        console.log("NO MATCH " + val);
                        continue;
                    }

                    val = parseFloat(data[1]);
                }

                nodeExif[exifTag] = val;


            }
        }
        // if the exif didn't contain gps data, then apply flickr location info when available
        if (_.isEmpty(nodeExif["Exif.GPSInfo.GPSLongitudeRef"])) {
            //console.log('no exif gps, trying with flickr ');
            if (!_.isEmpty(flickrLocation)) {
                var exivCompatibleLocation = convertFlickrLocationtoExivFormat(flickrLocation);
                if (!_.isEmpty(exivCompatibleLocation)) {
                    //console.log('applying flickr location');

                    nodeExif["Exif.GPSInfo.GPSLongitudeRef"] = exivCompatibleLocation.longitudeRef;
                    nodeExif["Exif.GPSInfo.GPSLatitudeRef"] = exivCompatibleLocation.latitudeRef;
                    nodeExif["Exif.GPSInfo.GPSLongitude"] = exivCompatibleLocation.longitude;
                    nodeExif["Exif.GPSInfo.GPSLatitude"] = exivCompatibleLocation.latitude;
                }

                else {
                    //console.log('cannot parse flickr location');
                }
            }
            else {
                //console.log('no  flickr location');
            }
        }
        else {
            //console.log('gps exif used')
        }

    }
    return nodeExif;
}

/**
 * get the flickr exif information from the api. Note that this information won't contain the gps information
 * unless the flickr objects comes from a signed (authenticated) call and not public one
 * @param flickr
 * @param photo_id
 * @param callback
 */
function getPhotoExif(flickr, photo_id, callback) {
    flickr.photos.getExif({photo_id: photo_id}, function (err, result) {
        if (!err) {
            //console.log('flickr exif: ' + JSON.stringify(result));
        }
        callback(err, result);
    })
}

/**
 * write the formatted exif information to the file
 * @param filePath
 * @param nodeExif
 * @param callback
 */
function applyPhotoExif(filePath, nodeExif, callback) {
    ex.setImageTags(filePath, nodeExif, function (err) {
        //if (err) {
        //    console.error(err);
        //} else {
        //    console.log("setImageTags complete..");
        //}
        callback(err);
    });
}

/**
 * get and add exif Data to a flickr photo that is already downloaded on disk.
 * @param flickr
 * @param filePath
 * @param photo_id
 * @param flickrLocation
 * @param callback
 */
function addExif(flickr, filePath, photo_id, flickrLocation, callback) {
    //console.log('processing photo ' + photo_id);
    async.waterfall(
        [
            function (wfCallback) {
                getPhotoExif(flickr, photo_id, function (err, result) {
                    if (err) {
                        wfCallback(err);

                    }
                    else {
                        wfCallback(null, convertExifFormat(result, flickrLocation))
                    }
                });
            },
            function (nodeExif, wfCallback) {
                //console.log('nodeexif: ' + JSON.stringify(nodeExif));
                applyPhotoExif(filePath, nodeExif, wfCallback);
            }
            //,
            //function (wfCallback) {
            //    imageinfo.readInfoFromFile(filePath, function (err, metadata) {
            //        //console.log('metadata for ' + filePath + ': ' + JSON.stringify(metadata));
            //    });
            //}

        ],
        callback
    );
}

/**
 * download the image with its exif data, given the photo object from flickr api
 * @param flickr
 * @param photoObject
 * @param flickrLocation
 * @param folder
 * @param callback
 */
function downloadWithExif(flickr, photoObject, flickrLocation, folder, callback) {
    var url = 'https://farm' + photoObject.farm +
        '.staticflickr.com/' + photoObject.server +
        '/' + photoObject.id +
        '_' + photoObject.secret +
        '.jpg';

    var filePath = path.join(folder, photoObject.id + '.jpg');
    async.series(
        [
            function (seriesCallback) {
                request.head(url, function (err, response, data) {
                    request(url).pipe(fs.createWriteStream(filePath)).on('close', seriesCallback);
                });
            },
            function (seriesCallback) {
                addExif(flickr, filePath, photoObject.id, flickrLocation, seriesCallback);
            }
        ], function (err) {
            if (err) {
                console.log(err);
            }
            callback(err);
        }
    );
}
module.exports = {
    addExif: addExif,
    downloadWithExif: downloadWithExif
};