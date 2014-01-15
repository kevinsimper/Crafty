window.onload = function(){
Crafty.init(640, 480);
Crafty.canvas.init();

Crafty.e('2D, Canvas, Color')
  .attr({x: 0, y: 0, w: 100, h: 100})
  .color('red')
  .bind('Draw', function(){
    Crafty.canvas.context.fillStyle = 'green';
    Crafty.canvas.context.fillRect(0, 0, 30, 30);
    
  });

  console.log(Crafty.canvas._canvas.width);
  console.log(Crafty.canvas._canvas.height);

};