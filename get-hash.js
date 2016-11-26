module.exports = function getHash(length, values, random) {
  length = length || 4
  values = values || "0123456789"
  random = random || Math.random
  var valuesLength = values.length
  var max          = Math.pow(valuesLength, length)
  return function get(list) {
    var attempts = 0
    var hash = ""
    do {
      hash = ""
      var i = length
      while (i--) {
        hash += values[(random() * valuesLength) | 0]
      }
      attempts++
    } while (list && list.indexOf(hash) !== -1 || attempts < max)
    list && list.push(hash)
    return hash
  }
}
