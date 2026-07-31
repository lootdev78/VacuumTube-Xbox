using System.Collections.Generic;

namespace VacuumTubeXbox.Models
{
    internal sealed class DialResult
    {
        public bool Handled { get; set; }
        public int ResponseCode { get; set; } = 200;
        public string MimeType { get; set; } = string.Empty;
        public string Body { get; set; } = string.Empty;
        public Dictionary<string, string> Headers { get; } = new Dictionary<string, string>();
    }
}
