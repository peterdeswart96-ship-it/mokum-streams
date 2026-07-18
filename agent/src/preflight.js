// Pure beoordeling of een camera LIVE beeld geeft, o.b.v. twee achtereenvolgende
// schermafbeeldingen van de camerabron. Géén OBS/netwerk → unit-testbaar.
//
// Waarom twee frames vergelijken: een live camera geeft altijd sensorruis, dus twee
// opeenvolgende frames zijn in de praktijk nooit byte-identiek. Een bevroren RTSP-bron
// (de storing van 15-07, zie #43) herhaalt exact hetzelfde frame → identiek. Een dode
// bron levert geen frame (null). Zo vangen we 'bevroren' én 'geen beeld' met één
// simpele vergelijking, zonder de pixels te hoeven decoderen.
//
// Bewuste aanname: het beeld beweegt genoeg om ruis/verschil te geven. Voor een
// pooltafel-camera geldt dat altijd (ruis, wisselend licht, spelers). Een kunstmatig
// stilstaand testpatroon zou vals-negatief kunnen geven — niet relevant in de praktijk.

function beoordeelCameraFrames(frame1, frame2) {
  const leeg = (f) => typeof f !== 'string' || f.length < 32;
  if (leeg(frame1) || leeg(frame2)) {
    return { live: false, reden: 'geen beeld van de camera' };
  }
  if (frame1 === frame2) {
    return { live: false, reden: 'bevroren beeld (twee identieke frames)' };
  }
  return { live: true, reden: 'beeld wisselt (live)' };
}

module.exports = { beoordeelCameraFrames };
