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
    },
    transition: function() {
      var i = 0;
      var length = arguments.length;
      var selections = [];

      for(; i < length; i++) {
        selections.push(arguments[i].transition());
      }

      return selections;
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

  var dom, svg, tooltip, root;
  var i = 0;

  var visualizer = {
    translateY: 0,
    translateX: 0,
    translate: function(y, x) {
      visualizer.translateY = y;
      visualizer.translateX = x;

      var transform = 'translate(' + y + 'px,' + x + 'px)';

      svg.style('transform', transform);
      dom.style('transform', transform);
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

      var oldY = root.y;
      var oldX = root.x;

      var height = 200 + (20 * Math.max.apply(Math, depthSize));
      var width = depthSize.length * 300;

      tree = tree.size([height, width]);

      var nodes = tree.nodes(root);
      // fixed size to 300px per layer
      nodes.forEach(function(node) {
        node.y = 300 * node.depth;
      });

      setTimeout(function() {
        nodes.forEach(function(d) {
          d.x0 = d.x;
          d.y0 = d.y;
        });

        svg.attr({
          height: height,
          width: width
        });
      }, 400);

      var links = tree.links(nodes);

      var yDiff = root.y - (oldY || root.y);
      var xDiff = root.x - (oldX || root.x);

      visualizer.translate(-root.y, -root.x);

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

      link.enter().append('path')
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

      var node = dom.selectAll('div.node')
          .data(nodes, function(d) { return d.node.remotePath; })
          .style('background-color', function(d) {
            if(((!d.children && !d._children) || (d.children && !d._children)) && d.listed && types.getType(d) !== 'action')
              return 'white';
            return types.getColor(d);
          });

      var text = dom.selectAll('div.text')
          .data(nodes, function(d) { return d.node.remotePath; });

      util.transition(node, text).forEach(function(el) {
        el.duration(400)
          .style('opacity', 1)
          .styleTween('transform', function(d) {
            return d3.interpolateString(
                'translate(' + ((d.y0 || 0) + yDiff) + 'px,' + ((d.x0 || 0) + xDiff) + 'px)',
                'translate(' + d.y + 'px,' + d.x + 'px)');
          });
      });

      util.transition(node.exit(), text.exit()).forEach(function(el) {
        el.duration(400)
          .style('opacity', 0)
          .styleTween('transform', function(d) {
            return d3.interpolateString(
                'translate(' + ((d.y0 || 0) + yDiff) + 'px,' + ((d.x0 || 0) + xDiff) + 'px)',
                'translate(' + n.y + 'px,' + n.x + 'px)');
          })
          .remove();
      });

      var nodeEnter = node.enter().append('div')
          .attr('class', 'node')
          .style('opacity', 0)
          .style('background-color', function(d) {
            return types.getColor(d);
          })
          .style('border-color', function(d) {
            return types.getColor(d);
          })
          .on('mouseover', function(d) {
            visualizer.showTooltip(d);
            var e = d3.select(this);
            e.style('transform', (e.style('transform') || '') + 'scale(1.33)');
          })
          .on('mouseout', function(d) {
            tooltip.hide();
            var e = d3.select(this);
            e.style('transform', 'translate(' + d.y + 'px,' + d.x + 'px)');
          })
          .on('click', function(d) {
            if(!d.listed) {
              visualizer.list(d.node.remotePath, d).then(function() {
                window.requestAnimationFrame(function() {
                  visualizer.update(d);
                });
              });
              return;
            }
            visualizer.toggle(d);
            window.requestAnimationFrame(function() {
              visualizer.update(d);
            });
          });

      var textEnter = text.enter().append('div')
          .attr('class', 'text')
          .style('opacity', 0)
          .text(function(d) { return d.name; });

      util.transition(nodeEnter, textEnter).forEach(function(el) {
        el.duration(400)
          .style('opacity', 1)
          .styleTween('transform', function(d) {
            return d3.interpolateString(
                'translate(' + n.y + 'px,' + n.x + 'px)',
                'translate(' + d.y + 'px,' + d.x + 'px)');
          });
      });

      node.select(function(d) {
        if(!d.queue.value)
          return null;
        d.queue.value = false;
        return this;
      }).append('div')
        .attr('class', 'value-update')
        .attr('transform', 'scale(1)')
        .attr('opacity', 1)
        .transition()
        .duration(300)
        .attr('transform', 'scale(80)')
        .attr('opacity', 0)
        .remove();
    },
    list: function(path, obj) {
      obj.listed = true;
      var called = false;
      return new Promise(function(resolve, reject) {
        console.log(path);
        visualizer.requester.list(path).on('data', function(update) {
          var children = update.node.children;
          var keys = Object.keys(children);

          var addChild = function(child) {
            var node = children[child];
            if(node.configs['$disconnectedTs'])
              return;

            var map = {
              name: node.configs['$name'] || child,
              realName: child,
              children: [],
              node: node,
              listed: false,
              queue: {
                value: false
              }
            };

            (obj._children || obj.children || (obj.children = [])).push(map);

            if(types.getType(map) === 'value') {
              map.value = null;
              var subCalled = false;
              visualizer.requester.subscribe(map.node.remotePath, function(subUpdate) {
                if(subCalled) {
                  map.queue.value = true;
                  window.requestAnimationFrame(function() {
                    visualizer.update(map);
                  });
                }

                subCalled = true;
                map.value = subUpdate.value;
              });
            }

            if(types.getType(map) === 'action') {
              visualizer.list(map.node.remotePath, map).then(function() {
                visualizer.toggle(map);
              });
            }
          }

          var removeChild = function(change) {
            [].concat(obj._children || obj.children).forEach(function(child, index) {
              if(child.realName === change)
                (obj._children || obj.children).splice(index, 1);
            });
          };

          if(!called) {
            keys.forEach(addChild);
            called = true;
          } else {
            update.changes.forEach(function(change) {
              if(change.indexOf('@') === 0 || change.indexOf('$') === 0)
                return;

              if(keys.indexOf(change) > 0) {
                if(children[change].configs['$disconnectedTs']) {
                  removeChild(change);
                  return;
                }
                addChild(change);
              } else {
                removeChild(change);
              }
            });
            window.requestAnimationFrame(function() {
              visualizer.update(obj);
            });
          }

          resolve();
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
    getScreenPos: function(d) {
      return {
        x: visualizer.translateY + d.y * zoom.scale() + zoom.translate()[0],
        y: (visualizer.translateX + d.x) * zoom.scale() + zoom.translate()[1]
      };
    },
    showTooltip: function(d) {
      var text = '';

      var addRow = function(content, style) {
        text += '<div class="legend-item" style="text-align:right;' + style + '">' + content + '</div>';
      };

      var addTitleRow = function(title, content, style) {
        text += '<div class="legend-container" style="' + style + '"><div class="legend-item legend-title">' + title + '</div><div class="legend-item legend-content">' + content + '</div></div>';
      };

      addTitleRow('<span style="color:' + types.getColor(d) + '">' + types.getType(d).toUpperCase() + '</span>', d.node.remotePath);

      var children = Object.keys(d.node.children).length;
      if(types.getType(d) === 'node' && children > 0)
        addRow(children + ' children');

      if(types.getType(d) === 'value') {
        var type = d.node.configs['$type'];
        addTitleRow('type', type);

        if(type === 'map' && d.value != null) {
          addRow('value', 'text-align:left;');
          var map = d.value._original;
          Object.keys(map).forEach(function(key) {
            var value = map[key];
            value = (value == null ? '<span style="color:#f1c40f;">null</span>' : value.toString());
            if(value.trim().length == 0)
              value = '<span style="color:#f1c40f;">\' \'</span>';
            addTitleRow(key, value, 'background-color: rgba(0,0,0,0.1);');
          });
        } else {
          var value = (d.value == null ? '<span style="color:#f1c40f;">null</span>' : d.value.toString());
          if(value.trim().length == 0)
            value = '<span style="color:#f1c40f;">\' \'</span>';
          addTitleRow('value', value);
        }
      }

      if(types.getType(d) === 'action') {
        var config = d.node.configs;
        var keys = Object.keys(config);

        if(keys.indexOf('$params') > 0) {
          var params = config['$params'];
          addRow('params', 'text-align:left;');

          params.forEach(function(param) {
            addTitleRow(param.name, param.type, 'background-color: rgba(0,0,0,0.1);');
          });
        }

        if(keys.indexOf('$columns') > 0) {
          var columns = config['$columns'];
          addRow('columns', 'text-align:left;');

          columns.forEach(function(column) {
            addTitleRow(column.name, column.type, 'background-color: rgba(0,0,0,0.1);');
          });
        }
      }

      var pos = visualizer.getScreenPos(d);
      tooltip.show(pos.x, pos.y, text);
    },
    done: function() {
      console.log('done');

      var div = d3.select('body').append('div')
          .style('width', '100%')
          .style('height', '100%')
          .call(zoom.on('zoom', function() {
            div.style('transform', 'translate(' + d3.event.translate[0] + 'px,'+ d3.event.translate[1] + 'px)scale(' + d3.event.scale + ')');
            zoom.translate(d3.event.translate);
            zoom.scale(d3.event.scale);
          }))
          .append('div')
          .attr('class', 'graph');

      svg = div.append('svg');
      dom = div.append('div');

      tooltip = (function() {
        var node = d3.select('body').append('div')
            .attr('id', 'tooltip')
            .style('display', 'none')
            .text('tooltip');

        return {
          node: node,
          show: function(x, y, text) {
            node.html(text);
            node.style('display', 'block');

            var rect = node.node().getBoundingClientRect();

            if(x + rect.width / 2 >= window.innerWidth)
              x -= rect.width / 2;
            if(x - rect.width / 2 <= 0)
              x += rect.width / 2;
            x -= rect.width / 2;

            node.style('left', x + 'px');

            if((y - 8 - rect.height) <= 0) {
              y += 8;
            } else {
              y -= rect.height;
              y -= 8;
            }

            node.style('top', y + 'px');
          },
          hide: function() {
            node.style('display', 'none');
            tooltip.node.style('left', 'auto');
            tooltip.node.style('top', 'auto');
            tooltip.node.style('right', 'auto');
            tooltip.node.style('bottom', 'auto');
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

      d3.select('body').append('div')
          .attr('id', 'home')
          .on('mouseover', function(d) {
            tooltip.node.text('Go to /conns');
            tooltip.node.style('display', 'block');
            tooltip.node.style('right', '88px');
            tooltip.node.style('bottom', '28px');
            tooltip.node.style('text-align', 'center');
          })
          .on('mouseout', function(d) {
            tooltip.node.style('text-align', 'left');
            tooltip.hide();
          })
          .on('click', function() {
            zoom.translate([400, 400]);
            zoom.scale(1);
            div.transition()
                .duration(800)
                .style('transform', 'translate(400px,400px)scale(1)');
          })
          .append('img')
          .attr('src', 'images/home.svg')
          .attr('width', '24px')
          .attr('height', '24px');

      window.requestAnimationFrame(function() {
        visualizer.update(root);
      });

      zoom.translate([400, 400]);
      zoom.event(div);
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
        if(params.url[params.url.length - 1] === '/')
          params.url = params.url.substring(0, -1);
        visualizer.connect(params.url);
      }
    }
  };

  document.addEventListener('DOMContentLoaded', visualizer.main, false);
})();
