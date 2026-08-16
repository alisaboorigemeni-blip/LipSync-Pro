self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;
  
  if (type === 'PARSE_VISEMES') {
    try {
      const { jsonString } = payload;
      const data = JSON.parse(jsonString);
      
      const sanitizeVisemes = (rawVisemes: any[]) => {
          return rawVisemes.map((v: any, i: number) => {
              const start = v.start ?? v.time ?? 0;
              let end = v.end;
              if (end === undefined) {
                  end = (i < rawVisemes.length - 1) 
                      ? (rawVisemes[i+1].start ?? rawVisemes[i+1].time ?? start + 0.1)
                      : start + 0.1;
              }
              return { start, end, viseme: v.viseme || v.value || 'X', strength: v.strength ?? 1.0 };
          });
      };

      let resultVisemes = [];
      if (Array.isArray(data) && data.length > 0 && (data[0].viseme || data[0].value)) {
          resultVisemes = sanitizeVisemes(data);
      } else if (data.visemes && Array.isArray(data.visemes)) {
          resultVisemes = sanitizeVisemes(data.visemes);
      } else {
          throw new Error("Invalid visemes format. Must contain an array of visemes.");
      }

      self.postMessage({ type: 'PARSE_VISEMES_SUCCESS', payload: resultVisemes });
    } catch (err: any) {
      self.postMessage({ type: 'PARSE_VISEMES_ERROR', error: err.message || "Error parsing JSON file" });
    }
  }
};
