"use strict";
const SETTINGS={
  isf:30,
  carb_ratio:10,
  zoom:10
}
const GLUCOSE_FACTOR_CONFIG = {
  INSULIN: {
    RAPID: { 
      PEAK: 80, 
      DURATION: 300, 
      ONSET: 15 
    },
  },
  CARB: {
    SIMPLE_CARB: { 
      PEAK: 30, 
      DURATION: 200, 
      ONSET: 0, 
      NAME: "SIMPLE CARB" 
    }, 
    COMPLEX_CARB: {
      PEAK: 60, 
      DURATION: 300,
      ONSET: 0, 
      NAME: "COMPLEX CARB" 
    } 
  }
};

class GlucoseCurve {

}

class GlucoseFactor {
  constructor(time, amount, type) {
    this.time = time;
    this.amount = amount;
    this.type = type;

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
      this.notifyAmount = method;
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
    let peakTime = d3.timeMinute.offset(this.time, this.type.PEAK)
    return { x: peakTime, y: this.getActivity(this.type.PEAK)}
  }

  getUUID() {
      return this.uuid;
  }

  setChart(chart) {
      this.chart = chart
  }
  getActivity(timePoint) {
    let end = this.type.DURATION - this.type.ONSET;
    let peak = this.type.PEAK - this.type.ONSET;

    if (timePoint < this.type.ONSET) {
        return 0; //ugly can we find a function with a nice slow start?
    }
    if (timePoint > end) {
        return 0;
    }

    let minsAgo = timePoint - this.type.ONSET;
    let insulin = this.amount; //* SETTINGS.zoom;

    let tau = peak * (1 - peak / end) / (1 - 2 * peak / end);  // time constant of exponential decay
    let a = 2 * tau / end;                                     // rise time factor
    let S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));      // auxiliary scale factor

    var activityContrib = insulin * (S / Math.pow(tau, 2)) * minsAgo * (1 - minsAgo / end) * Math.exp(-minsAgo / tau);
    return activityContrib * SETTINGS.isf;
  }

}

class Insulin extends GlucoseFactor {
  constructer(time, amount, type) {
    super(time, amount, type);
  }

  apply(glucoseValue, timePoint) {
    let minutes = (timePoint - this.time) / (60 * 1000);
    if ((minutes < 0) | minutes > this.type.DURATION) {
        return glucoseValue;
    } else {
        return glucoseValue - this.getActivity(minutes); //SETTINGS.zoom
    }
  }
  updateGraph() {
    if (this.chart) {
        this.chart.updateInsulin(this);
    }
  }
}

class Carbohydrate {
  constructer(time, amount, type) {
    super(time, amount, type);
  }

  apply(glucoseValue, timePoint) {
    let MILLISECOND = 1 / (60 * 1000);

    let minutes = (timePoint - this.time) / (60 * 1000)
    if (minutes < 0 | minutes > this.type.DURATION) {
      return glucoseValue
    } else {
        return glucoseValue + this.getActivity(minutes) / SETTINGS.zoom
    }
  }
  updateGraph() {
    if (this.chart) {
        this.chart.updateInsulin(this);
    }
  }
}

class Chart { 
  margin = { top: 20, right: 20, bottom: 30, left: 50 };
  constructor(svg, timeRange, targetRange = [70, 180]) {
    this.svg = d3.select(svg); //select target

    this.width = this.svg.attr("width") - this.margin.left - this.margin.right;
    this.height = this.svg.attr("height") - this.margin.top - this.margin.bottom;
    this.targetRange = targetRange;

    this.x = d3.scaleTime().range([0, this.width]).clamp(true);
    this.y = d3.scaleLinear().domain([0, 300])
        .rangeRound([this.height, 0]).clamp(true);
    this.y.domain([0, 300]);
    this.x.domain(timeRange);

    this.drawGraphArea(this.svg);
}

  drawToolTip(svg) {
    let tooltip = svg.append("g");
    let rectData = {
        height: 150,
        width: 300,
        x: 380,
        y: 10,
        rx: 30
    };

    // Background
    tooltip.append("rect")
        .style("fill", "white")
        .style("stroke", "black")
        .attr("x", rectData.x)
        .attr("y", rectData.y)
        .attr("width", rectData.width)
        .attr("height", rectData.height)
        .attr("rx", rectData.rx);

    // Text
    tooltip.append("text").text("Please hover over \"!\" and other points of interest for more information")
        .attr("x", rectData.x + 30)
        .attr("y", rectData.y + 30)
        .attr("visibility", "visible")
        .attr("id", "tooltip-text")
        .call(wrap, 250);
  }

  drawTargetRange(range) {
    let targetRangeGroup = this.graphArea.append('g').attr("class", "range");
    let rect = {
        x1: 0,
        x2: this.width,
        y1: this.y(range[0]),
        y2: this.y(range[1]),
    };
    // shade targetRange section
    targetRangeGroup.append('rect')
        .style("fill", "#EFF6FE")
        .attr("x", rect.x1)
        .attr("y", rect.y2)
        .attr("width", rect.x2)
        .attr("height", rect.y1 - rect.y2);

    // lower threshold
    targetRangeGroup.append('line')
        .style("stroke", "#EB8690")
        .style("stroke-dasharray", ("3, 5"))
        .style("stroke-width", 2)
        .attr("x1", rect.x1)
        .attr("y1", rect.y1)
        .attr("x2", rect.x2)
        .attr("y2", rect.y1);

    // upper threshold
    targetRangeGroup.append('line')
        .style("stroke", "#EB8690")
        .style("stroke-dasharray", ("3, 5"))
        .style("stroke-width", 2)
        .attr("x1", rect.x1)
        .attr("y1", rect.y2)
        .attr("x2", rect.x2)
        .attr("y2", rect.y2);
  }
  drawGraphArea(svg) {
    this.graphArea = svg.append("g")
        .attr("transform", `translate(${this.margin.left}, ${this.margin.top})`);
    this.drawTargetRange();

    // yAxis
    this.svg.append("text")
        .attr("transform", `translate(${this.margin.right / 2},${this.y(100)}) rotate(-90)`)
        .attr("class", "range")
        .text("Digestion Rate");
    let yAxis = d3.axisLeft(this.y)
                  .tickSize(0)
                  .tickValues([]);
    this.graphArea.append('g')
        .attr('class', 'axis axis--y')
        .call(yAxis);

    // xAxis
    let xAxis = d3.axisBottom(this.x);
    this.graphArea.append('g')
        .attr('class', 'axis axis--x')
        .attr('transform', `translate(0,${this.height})`)
        .call(xAxis);
  }
  drawGlucoseCurve(glucoseCurve) {
    this.glucoseCurve = glucoseCurve;
    glucoseCurve.setChart(this);
    this.removeBG();  //clean up before we start
    let scatterPlot = this.graphArea.append("g").attr("class", "bg_curve");

    scatterPlot.selectAll('circle')
        .data(glucoseCurve.getShape())
        .enter()
        .append('circle')
        .attr('r', 3.0)
        //.style('cursor', 'pointer')
        .style('fill', '#000000'); // glucose curve color
    this.updateBG(bg);
}


}