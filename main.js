(function() {
  'use strict';

  var util = {
    getUrlParams: function() {
      var urlParams = {},
          match,
          pl = /\+/g, // Regex for replacing addition symbol with a space
          search = /([^&=]+)=?([^&]*)/g,
          decode = function (s) { return decodeURIComponent(s.replace(pl, ' ')); },
          query  = window.location.search.substring(1);

      while (match = search.exec(query))
        urlParams[decode(match[1])] = decode(match[2]);
      return urlParams;
    },
    toggleElements: function(elements) {
      return {
        show: function() {
          Object.keys(elements).forEach(function(element) {
            document.getElementById(element).style.display = elements[element];
          });
        },
        hide: function() {
          Object.keys(elements).forEach(function(element) {
            document.getElementById(element).style.display = 'none';
          });
        }
      };
    }
  };

  // from Flat UI colors, with love
  // https://flatuicolors.com/

  // emerald
  var COLOR_NODE = '#2ecc71';
  // peter river
  var COLOR_VALUE = '#3498db';
  // alizarin
  var COLOR_ACTION = '#e74c3c';

  var types = {
    colors: {
      node: COLOR_NODE,
      action: COLOR_ACTION,
      value: COLOR_VALUE
    },
    getColor: function(d) {
      return types.colors[types.getType(d)];
    },
    getType: function(d) {
      if(d.node.configs['$type'])
        return 'value';
      if(d.node.configs['$invokable'])
        return 'action';
      return 'node';
    }
  };

  var tree = d3.layout.tree();

  var diagonal = d3.svg.diagonal()
      .projection(function(d) { return [d.y, d.x]; });

  var zoom = d3.behavior.zoom();

  var svg, tooltip, root;
  var i = 0;

  var visualizer = {
    translateY: 0,
    translateX: 0,
    translate: function(y, x) {
      visualizer.translateY = y;
      visualizer.translateX = x;
      svg.attr('transform', 'translate(' + y + ',' + x + ')');
    },
    toggle: function(d) {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else {
        d.children = d._children;
        d._children = null;
      }
    },
    update: function(n) {
      var depthSize = [1];
      var depth = function(obj, d) {
        if(obj.children && obj.children.length > 0) {
          obj.children.forEach(function(child) {
            depthSize[d] = !!depthSize[d] ? depthSize[d] + 1 : 1;
            depth(child, d + 1);
          });
        }
      }

      depth(root, 1);

      var oldY = root.y || 0;
      var oldX = root.x || 0;

      tree = tree.size([200 + (20 * Math.max.apply(Math, depthSize)), depthSize.length * 300]);

      var nodes = tree.nodes(root);
      // fixed size to 20px per layer
      nodes.forEach(function(node) {
        node.y = 300 * node.depth;
      });

      var links = tree.links(nodes);

      var yDiff = root.y - oldY;
      var xDiff = root.x - oldX;

      var link = svg.selectAll('.link')
          .data(links, function(d) { return d.target.node.remotePath; });

      link.attr('d', function(d) {
            return diagonal({
              source: {
                y: d.source.y0 + yDiff,
                x: d.source.x0 + xDiff
              },
              target: {
                y: d.target.y0 + yDiff,
                x: d.target.x0 + xDiff
              }
            });
          })
          .transition()
          .duration(400)
          .attr('d', diagonal);

      link.enter().insert('path', 'g')
          .attr('class', 'link')
          .attr('d', function(d) {
            var map = {
              y: (n.y0 || n.y) + yDiff,
              x: (n.x0 || n.x) + xDiff
            };

            return diagonal({
              source: map,
              target: map
            });
          })
          .transition()
          .duration(400)
          .attr('d', diagonal);

      link.exit()
          .attr('d', function(d) {
            return diagonal({
              source: {
                y: d.source.y0 + yDiff,
                x: d.source.x0 + xDiff
              },
              target: {
                y: d.target.y0 + yDiff,
                x: d.target.x0 + xDiff
              }
            });
          })
          .transition()
          .duration(400)
          .attr('d', function(d) {
            return diagonal({source: n, target: n});
          })
          .remove();

      var node = svg.selectAll('.node')
          .data(nodes, function(d) { return d.node.remotePath; });

      node.attr('transform', function(d) { return 'translate(' + ((d.y0 || 0) + yDiff) + ',' + ((d.x0 || 0) + xDiff) + ')'; });

      var nodeEnter = node.enter().append('g')
          .attr('class', 'node')
          .attr('transform', 'translate(' + n.y + ',' + n.x + ')')
          .attr('opacity', 0);

      node.transition()
          .duration(400)
          .attr('opacity', 1)
          .attr('transform', function(d) { d.y0 = d.y; d.x0 = d.x; return 'translate(' + d.y + ',' + d.x + ')'; });

      node.exit()
          .attr('transform', function(d) { return 'translate(' + ((d.y0 || 0) + yDiff) + ',' + ((d.x0 || 0) + xDiff) + ')'; })
          .attr('opacity', 1)
          .transition()
          .duration(400)
          .attr('opacity', 0)
          .attr('transform', 'translate(' + n.y + ',' + n.x + ')')
          .remove();

      var circle = nodeEnter.append('circle')
          .attr('r', 4.5)
          .on('mouseover', function(d) {
            var text = '<span style="margin-right: 8px;color: '
              + types.getColor(d) + ';">'
              + types.getType(d).toUpperCase()
              + '</span>' + d.node.remotePath;

            var children = Object.keys(d.node.children).length;

            if(types.getType(d) === 'node' && children > 0)
              text += '<div class="legend-item" style="text-align:right;">' + children + ' children</div>'

            tooltip.show(d, text);
            d3.select(this).attr('r', 6);
          })
          .on('mouseout', function(d) {
            tooltip.hide();
            d3.select(this).attr('r', 4.5);
          })
          .on('click', function(d) {
            if(types.getType(d) !== 'node')
              return;
            if(!d.listed) {
              visualizer.list(d.node.remotePath, d).then(function() {
                visualizer.update(d);
              });
              return;
            }
            visualizer.toggle(d);
            visualizer.update(d);
          });

      nodeEnter.append('text')
          .attr('dx', function(d) { return d.children && d.children.length > 0 ? -8 : 8; })
          .attr('dy', 3)
          .style('text-anchor', function(d) { return d.children && d.children.length ? 'end' : 'start'; })
          .text(function(d) { return d.name; });

      node.select('circle')
        .style('fill', function(d) {
          if(((!d.children && !d._children) || (d.children && !d._children)) && types.getType(d) === 'node' && d.listed)
            return 'white';
          return types.getColor(d);
        })
        .style('stroke', function(d) {
          if(((!d.children && !d._children) || (d.children && !d._children)) && types.getType(d) === 'node' && d.listed)
            return types.getColor(d);
          return 'none';
        })
        .style('stroke-width', function(d) {
          if(((!d.children && !d._children) || (d.children && !d._children)) && types.getType(d) === 'node' && d.listed)
            return '1.5px';
          return '0';
        });

      visualizer.translate(-root.y, -root.x);
    },
    list: function(path, obj, deep) {
      obj.listed = true;
      var called = false;
      return new Promise(function(resolve, reject) {
        console.log(path);
        visualizer.requester.list(path).on('data', function(update) {
          if(called)
            return;
          called = true;

          var promises = [];
          Object.keys(update.node.children).forEach(function(child) {
            var node = update.node.children[child];
            var map = {
              name: node.configs['$name'] || child,
              children: [],
              node: node,
              listed: false
            };

            (obj._children || obj.children || (obj.children = [])).push(map);

            // if(!deep)
            //  promises.push(list(node.remotePath, map, true));
          });

          Promise.all(promises).then(function() {
            resolve();
          }).catch(function(e) {
            reject(e);
          });
        });
      });
    },
    connect: function(url) {
      var link = new DS.LinkProvider(url, 'visualizer-', {
        isRequester: true,
        isResponder: false
      });

      return link.connect().then(function() {
        return link.onRequesterReady;
      }).then(function(requester) {
        root = {};

        visualizer.requester = requester;
        visualizer.list('/', root).then(function() {
          root.children.forEach(function(child) {
            if(child.name === 'conns')
              root = child;
          })

          return visualizer.list('/conns', root);
        }).then(visualizer.done);
      }).catch(function(err) {
        console.log(err.$thrownJsError ? err.$thrownJsError.stack : err.stack);
      });
    },
    done: function() {
      console.log('done');

      var svgRoot = d3.select('body').append('svg')
          .style('width', '100%')
          .style('height', '100%')
          .call(zoom.on('zoom', function() {
            svgRoot.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
            zoom.translate(d3.event.translate);
            zoom.scale(d3.event.scale);
          }))
          .append('g');

      svg = svgRoot.append('g');

      tooltip = (function() {
        var node = d3.select('body').append('div')
            .attr('id', 'tooltip')
            .style('display', 'none')
            .text('tooltip');

        return {
          show: function(d, text) {
            var x = ((d.y + visualizer.translateY) * zoom.scale() + zoom.translate()[0]);
            var y = ((d.x + visualizer.translateX) * zoom.scale() + zoom.translate()[1]);

            node.html(text);
            node.style('display', 'block');

            var rect = node.node().getBoundingClientRect();

            node.style('left', (x - (rect.width / 2)) + 'px');
            node.style('top', (y - 8 - rect.height) + 'px');
          },
          hide: function() {
            node.style('display', 'none');
          }
        };
      }());

      var legend = d3.select('body').append('div')
          .attr('id', 'legend');

      legend.append('p')
          .attr('id', 'title')
          .text('Visualizer');

      Object.keys(types.colors).forEach(function(type) {
        legend.append('div')
            .attr('class', 'legend-item')
            .html('<div class="color" style="float:left;background-color:' + types.colors[type] + ';"></div><div style="float:left;display:inline-block;">' + type.toUpperCase() + '</div>');
      });

      visualizer.update(root);

      zoom.translate([400, 400]);
      zoom.event(svgRoot);
    },
    main: function() {
      var params = util.getUrlParams();
      var elements = util.toggleElements({
        title: 'block',
        container: 'flex'
      });

      if(!params.url) {
        elements.show();

        document.getElementById('connect-btn').onclick = function() {
          var url = document.getElementById('broker-url').value;
          visualizer.connect(url).then(function() {
            elements.hide();
          });
        };
      } else {
        visualizer.connect(params.url);
      }
    }
  };

  document.addEventListener('DOMContentLoaded', visualizer.main, false);
})();
