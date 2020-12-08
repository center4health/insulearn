"use strict";
const SETTINGS={
  isf:30,
  carb_ratio:10,
  zoom:10
}

class GlucoseCurve {

}

class GlucoseFactor {
  constructor(time, amount, type) {
    this.time = time;
    this.amount = amount;
    this.type = type;

    this.default_time = time; // ?
    this.uuid = uuidv4() //?
  }
  
  getShape(samplingInterval=5) {
    let dataPoints = [];
    let timePoint = 0;
    let END = this.type.DURATION;

    for (timepoint; timePoint < END; timePoint += samplingInterval) {
      dataPoints.push({ x: d3.timeMinute.offset(this.time, timePoint), 
                         y: this.getActivity(timePoint)});
    }
    return dataPoints
  }

  getTime() {
    return this.time;
  }

  onAmountChange(method){
      this.notifyAmount=method
  }

  setAmount(amount) {
    let change = amount - this.amount;
    this.amount = amount;
    if(this.notifyAmount){
        this.notifyAmount(amount, change);
    }
    this.updateGraph()
    return this;
  }

  getAmount() {
    return this.amount;
  }

  getYHandle() {
    let peak = d3.timeMinute.offset(this.time, this.type.PEAK)
    return { x: peak, y: this.getActivity(this.type.PEAK)}
  }

  getUUID() {
      return this.uuid;
  }
  setChart(chart) {
      this.chart = chart
  }






}