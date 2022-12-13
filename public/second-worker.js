self.onmessage = function(event) {
  var x = 0;
  for (var i = 0; i < 200000000; i++) {
      x = x + i;
  }    self.postMessage(x);
}